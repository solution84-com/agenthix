/**
 * Instructions a site must receive even if it is offline when they are given —
 * today the membership-ending ones (core's MEMBERSHIP_METHODS; person-scoped
 * execution spec §4, "When membership ends").
 *
 * An instruction is a `HeldSiteInstruction` row first, written in the same
 * transaction as the change that caused it, so it cannot be lost between the
 * change committing and the send. Delivery then reads the site's
 * unacknowledged rows in `sequence` order and sends each; a row is done only
 * when the site's `MembershipAck` names its id. A site that is offline, or a
 * send that fails, leaves the row as it is: the reconnect hook
 * (`channel/index.ts`) delivers again. The site's handlers are idempotent, so
 * a row that is sent twice — a late acknowledgement, a replay — does no harm.
 *
 * Delivery never throws. The change that caused an instruction has already
 * committed and must not fail because a site is down.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { MembershipInstruction } from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from './channel'
import { Logger } from '../server/utils/logger'

const logger = new Logger('HeldInstructions')

/**
 * Longer than a read's default: the site answers only once it has stopped the
 * runs, removed the container and deleted the home. An answer that arrives
 * after this is dropped, and the row is sent again on the next reconnect.
 */
export const INSTRUCTION_TIMEOUT_MS = 120_000

/** Failures that mean the site is not there to ask; the rest of a pass waits for the reconnect. */
const UNREACHABLE_CODES = new Set(['offline', 'disconnected', 'timeout'])

type WithoutId<I> = I extends { method: infer M; params: infer P } ? { method: M; params: Omit<P, 'instructionId'> } : never
/** An instruction as its caller gives it; the id is the held row's, added here. */
export type InstructionWithoutId = WithoutId<MembershipInstruction>

/**
 * The rows to write, one per site, for `createMany` inside the transaction
 * that makes the change. Each row's id is chosen here rather than by the
 * database because its params carry it as `instructionId`, the name the
 * site's acknowledgement answers with.
 */
export function heldInstructionRows(
  siteIds: string[],
  instruction: InstructionWithoutId,
): Prisma.HeldSiteInstructionCreateManyInput[] {
  return siteIds.map(siteId => {
    const id = randomUUID()
    return {
      id,
      siteId,
      method: instruction.method,
      params: { ...instruction.params, instructionId: id } as Prisma.InputJsonValue,
    }
  })
}

/**
 * Of these logical site ids, the ones an instruction can be held for: a site
 * hq knows (the row's foreign key needs it) and has not revoked. A revoked
 * site is refused at the handshake and never reconnects, so a row held for it
 * could never be delivered.
 */
export async function sitesToInstruct(siteIds: Iterable<string | null>): Promise<string[]> {
  const wanted = [...new Set([...siteIds].filter((id): id is string => typeof id === 'string'))]
  if (wanted.length === 0) return []
  const rows = await prisma.executionSite.findMany({
    where: { siteId: { in: wanted }, status: { not: 'REVOKED' } },
    select: { siteId: true },
  })
  const known = new Set(rows.map(r => r.siteId))
  return wanted.filter(id => known.has(id))
}

/**
 * One delivery pass at a time per site, so a reconnect and a membership change
 * arriving together cannot interleave their sends out of `sequence` order.
 * hq is one process, so an in-memory chain is the whole of it.
 */
const passes = new Map<string, Promise<void>>()

/** Sends every unacknowledged instruction held for this site, oldest first. Never throws. */
export function deliverHeldInstructions(siteId: string): Promise<void> {
  const previous = passes.get(siteId) ?? Promise.resolve()
  const next = previous.then(() => deliveryPass(siteId)).catch(err => {
    logger.error(`delivery to site ${siteId} failed:`, err)
  })
  passes.set(siteId, next)
  void next.finally(() => {
    if (passes.get(siteId) === next) passes.delete(siteId)
  })
  return next
}

/** `deliverHeldInstructions` for each site, together. Never throws. */
export async function deliverHeldInstructionsTo(siteIds: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(siteIds)].map(deliverHeldInstructions))
}

async function deliveryPass(siteId: string): Promise<void> {
  if (!siteChannelRegistry.isOnline(siteId)) return
  const rows = await prisma.heldSiteInstruction.findMany({
    where: { siteId, acknowledgedAt: null },
    orderBy: { sequence: 'asc' },
    select: { id: true, method: true, params: true },
  })

  for (const row of rows) {
    await prisma.heldSiteInstruction.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    })
    try {
      // hq wrote each row from a `MembershipInstruction` (`InstructionWithoutId`), so it holds one of those methods with its params.
      const instruction = { method: row.method, params: row.params } as unknown as MembershipInstruction
      const ack = await siteChannelRegistry.request(siteId, instruction.method, instruction.params, INSTRUCTION_TIMEOUT_MS)
      if (ack?.acknowledged !== true || ack.instructionId !== row.id) {
        throw new Error(`the site's answer did not acknowledge instruction ${row.id}`)
      }
      await prisma.heldSiteInstruction.update({ where: { id: row.id }, data: { acknowledgedAt: new Date(), lastError: null } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await prisma.heldSiteInstruction.update({ where: { id: row.id }, data: { lastError: message } })
      if (err instanceof ChannelRequestFailed && UNREACHABLE_CODES.has(err.code)) {
        logger.warn(`site ${siteId} went unreachable at instruction ${row.id}; the rest wait for its reconnect`)
        return
      }
      // The site answered, and refused or failed this one. Every instruction
      // stands alone — each only ends access and removes state, and each is
      // idempotent — so the later ones are still sent, in order, and this one
      // is tried again on the next reconnect.
      logger.error(`site ${siteId} did not carry out instruction ${row.id} (${row.method}): ${message}`)
    }
  }
}
