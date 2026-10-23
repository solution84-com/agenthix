/**
 * The `InferenceTurn` row as a turn runs (conversation layer spec, Failure, recovery and observability): its
 * model, when its first token came, and how it ended — with its usage and, on failure, the reason. A turn's
 * end is written only while it is still the running turn, so a turn failed by recovery, or stopped from
 * another process, is never written over by the process that lost it.
 */
import { prisma } from 'wasp/server'
import type { ModelErrorKind, ResolvedAccess, TurnUsage } from '../contract'

export type TurnEnd = 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface TurnRecord {
  /** The turn's model and the provider it talks through. */
  setAccess(turnId: string, access: ResolvedAccess): Promise<void>
  firstToken(turnId: string, at: Date): Promise<void>
  /** Records the end; false when the turn was already ended by someone else (recovery). */
  finish(turnId: string, end: { state: TurnEnd; usage: TurnUsage; contextTokens?: number; error: string | null; errorKind?: ModelErrorKind | null; at: Date }): Promise<boolean>
  /** Whether Stop was pressed for it in another process: it reads CANCELLED while it still runs here. */
  stopRequested(turnId: string): Promise<boolean>
}

export const turnRecord: TurnRecord = {
  async setAccess(turnId, access) {
    await prisma.inferenceTurn.update({ where: { id: turnId }, data: { model: access.model, providerId: access.providerId } })
  },

  async firstToken(turnId, at) {
    await prisma.inferenceTurn.updateMany({ where: { id: turnId, firstTokenAt: null }, data: { firstTokenAt: at } })
  },

  async finish(turnId, end) {
    const { count } = await prisma.inferenceTurn.updateMany({
      where: { id: turnId, state: { in: ['RUNNING', 'CANCELLED'] }, endedAt: null },
      data: {
        state: end.state,
        error: end.error,
        errorKind: end.errorKind ?? null,
        endedAt: end.at,
        inputTokens: end.usage.inputTokens,
        outputTokens: end.usage.outputTokens,
        cacheReadTokens: end.usage.cacheReadTokens,
        cacheWriteTokens: end.usage.cacheWriteTokens,
        contextTokens: end.contextTokens ?? 0,
      },
    })
    return count === 1
  },

  async stopRequested(turnId) {
    const row = await prisma.inferenceTurn.findUnique({ where: { id: turnId }, select: { state: true } })
    return row?.state === 'CANCELLED'
  },
}

/** Stop pressed where the turn may not be running: marked on its row, which the process running it reads. */
export async function requestStop(turnId: string): Promise<void> {
  await prisma.inferenceTurn.updateMany({ where: { id: turnId, state: 'RUNNING' }, data: { state: 'CANCELLED' } })
}
