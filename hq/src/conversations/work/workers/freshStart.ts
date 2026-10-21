/**
 * A standing worker started fresh (long conversations spec, Workers and tasks): between operations — never
 * mid-run — a worker whose context has passed the high mark gets a new session for its slot, and the slot's briefs
 * go to it. Briefs stand alone and results live in the operations, so little is lost. The harness compacts its
 * own session as its vendor intends until then.
 *
 * It is decided when the queue has just taken a brief and the worker is free: nothing of it is accepted, running
 * or waiting for approval, so no run is cut and no approval continues in a session other than the one that asked.
 * A brief that reached a worker already started fresh from — admitted while the fresh start happened — moves on to
 * the slot's worker the same way. So does a brief whose model needs another runtime than the worker's (`workerChoice`):
 * a session keeps the runtime it began on, so the slot gets a new session on that runtime.
 */
import { prisma } from 'wasp/server'
import type { AgentSession, Prisma } from '@prisma/client'
import { parseContextUse, type ContextUse } from '@agenthix/core'
import { COMPACT_HIGH_MARK } from '../../../shared/conversations/protocol'
import { isConversationClosed, isHarnessStateLost } from '../../../shared/closedConversation'
import * as dispatchService from '../../../agents/dispatchService'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { Logger } from '../../../server/utils/logger'
import { findWorker, freshWorker, slotOf } from './standingWorker'

const logger = new Logger('WorkerFreshStart')

/** Whether the runtime's own figure has passed the high mark of its window. */
export function pastHighMark(use: ContextUse | null): boolean {
  return use !== null && use.window > 0 && use.tokens / use.window >= COMPACT_HIGH_MARK
}

export type FreshStartDecision = 'stay' | 'move' | 'fresh'

/**
 * Where a brief just taken on `worker` runs: here; on the slot's newer worker (`move`); or on a new one (`fresh`).
 * A closed worker stays, so the brief fails with why rather than a new session hiding the reason; one whose
 * harness state is gone (`lost`) is not closed for good, so the slot starts fresh.
 */
export function decide(input: { isCurrent: boolean; closed: boolean; lost?: boolean; otherRuntime?: boolean; use: ContextUse | null }): FreshStartDecision {
  if (!input.isCurrent) return 'move'
  if (input.lost) return 'fresh'
  if (input.closed) return 'stay'
  if (input.otherRuntime) return 'fresh'
  return pastHighMark(input.use) ? 'fresh' : 'stay'
}

async function contextUseOf(worker: AgentSession): Promise<ContextUse | null> {
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(worker)
    return parseContextUse((await siteRuntimeStore.getSession(siteId, worker.id))?.contextUse)
  } catch (err) {
    logger.warn(`could not read the context use of worker ${worker.id}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Moves the worker's waiting briefs — the one just taken included, queued again — to `to`, under the worker's
 * queue lock, so none is taken here meanwhile.
 */
async function moveBriefs(from: string, to: string): Promise<number> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('standing-worker'), hashtext(${from}))`
    const { count } = await tx.operation.updateMany({
      where: { workerSessionId: from, state: { in: ['QUEUED', 'ACCEPTED'] }, runId: null },
      data: { workerSessionId: to, state: 'QUEUED' },
    })
    return count
  })
}

/**
 * Called with a brief the queue has just taken on `workerSessionId`, and the runtime its model needs. Returns null
 * when the brief runs here, or the worker it was moved to, whose queue the caller moves on.
 */
export async function placeTakenBrief(workerSessionId: string, neededRuntime: string | null = null): Promise<string | null> {
  const worker = await prisma.agentSession.findUnique({ where: { id: workerSessionId } })
  const slot = worker ? slotOf(worker) : null
  if (!worker || !slot) return null
  const current = await findWorker(slot)
  const isCurrent = !current || current.id === worker.id
  const lost = isHarnessStateLost(worker)
  const closed = isConversationClosed(worker) && !lost
  const otherRuntime = !!neededRuntime && !!worker.runtime && worker.runtime !== neededRuntime
  const use = isCurrent && !closed && !lost && !otherRuntime ? await contextUseOf(worker) : null
  const decision = decide({ isCurrent, closed, lost, otherRuntime, use })
  if (decision === 'stay') return null
  const target = decision === 'move' ? current! : await freshWorker(worker, slot, otherRuntime ? neededRuntime : null)
  if (target.id === worker.id) return null
  if (decision === 'fresh') {
    logger.info(otherRuntime
      ? `worker ${worker.id} runs on ${worker.runtime}, the brief needs ${neededRuntime}; started fresh as ${target.id}`
      : `worker ${worker.id} passed the high mark (${use?.tokens} of ${use?.window}); started fresh as ${target.id}`)
  }
  await moveBriefs(worker.id, target.id)
  return target.id
}
