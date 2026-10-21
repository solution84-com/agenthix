/**
 * The `Operation` row of a lead's tool call (conversation layer spec, Detaching, step by step): created before
 * the call starts, so the call has a stable id whether it answers within the wait limit or is detached; marked
 * promoted when it is; settled with its capped result when it ends.
 *
 * Only a pending call holds its idempotency key: settling moves the key aside, so an identical call while one
 * is running is that one, and the same call made after it ended is a new call.
 */
import { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import { sealJson, sealText } from '../sealing'
import type { TurnCapability } from '../contract'

export interface AdmitToolCall {
  capability: TurnCapability
  toolName: string
  idempotencyKey: string
  title: string
  /** The call's arguments, kept sealed so a read cut by a restart can be run again (work/reconcile/calls.ts). */
  args?: unknown
}

export type ToolCallSettlement =
  | { state: 'COMPLETED'; result: unknown }
  | { state: 'FAILED'; error: string }

export interface ToolOperationRows {
  /** The pending call with this key, or a new one, running from now. */
  admit(input: AdmitToolCall): Promise<{ operationId: string; alreadyRunning: boolean }>
  promote(operationId: string): Promise<void>
  settle(operationId: string, settlement: ToolCallSettlement): Promise<void>
}

/** The person a call is commissioned by: the turn's, or for a turn that answers no one, the reader it reads as. */
export function commissioner(capability: TurnCapability): string | null {
  return capability.actingUserId ?? capability.readerUserId ?? null
}

function boundaryOf(capability: TurnCapability, person: string): { boundaryType: 'user' | 'project'; boundaryId: string } | null {
  if (capability.home === 'PERSON') return { boundaryType: 'user', boundaryId: person }
  return capability.projectId ? { boundaryType: 'project', boundaryId: capability.projectId } : null
}

async function pendingWithKey(conversationId: string, idempotencyKey: string): Promise<string | null> {
  const row = await prisma.operation.findUnique({
    where: { conversationId_idempotencyKey: { conversationId, idempotencyKey } },
    select: { id: true },
  })
  return row?.id ?? null
}

export const operationRows: ToolOperationRows = {
  async admit({ capability, toolName, idempotencyKey, title, args }) {
    const { conversationId } = capability
    const existing = await pendingWithKey(conversationId, idempotencyKey)
    if (existing) return { operationId: existing, alreadyRunning: true }
    const person = commissioner(capability)
    if (!person) throw new Error('A tool call needs a person to commission it')
    try {
      const row = await prisma.operation.create({
        data: {
          conversationId,
          turnId: capability.turnId,
          kind: 'TOOL',
          mode: 'FOREGROUND',
          toolName,
          idempotencyKey,
          state: 'RUNNING',
          title: sealText(title),
          ...(args !== undefined ? { args: sealJson(args) } : {}),
          authorisedById: person,
          ...boundaryOf(capability, person),
        },
        select: { id: true },
      })
      return { operationId: row.id, alreadyRunning: false }
    } catch (err) {
      // Two identical calls admitted at once: the one that lost the race is the other.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await pendingWithKey(conversationId, idempotencyKey)
        if (winner) return { operationId: winner, alreadyRunning: true }
      }
      throw err
    }
  },

  async promote(operationId) {
    await prisma.operation.update({ where: { id: operationId }, data: { promoted: true } })
  },

  async settle(operationId, settlement) {
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operationId }, select: { idempotencyKey: true } })
    await prisma.operation.update({
      where: { id: operationId },
      data: {
        state: settlement.state,
        completedAt: new Date(),
        idempotencyKey: `${row.idempotencyKey}:${operationId}`,
        ...(settlement.state === 'COMPLETED'
          ? { resultSummary: sealJson(settlement.result) }
          : { error: settlement.error }),
      },
    })
  },
}
