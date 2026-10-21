/**
 * Compaction at the marks, at the start of a turn (long conversations spec): after the turn's access is known and
 * before its context is assembled, so its first model call already reads the new block. A failed summariser call
 * leaves the conversation as it was and the turn goes on; a stop pressed meanwhile stops the turn.
 */
import type { ResolvedAccess, TurnUsage } from '../contract'
import type { SegmentCompactor } from './compactor'

export type CompactAtStart = (
  conversationId: string,
  access: ResolvedAccess,
  inputIds: readonly string[],
  signal: AbortSignal,
) => Promise<TurnUsage | null>

export function createCompactAtStart(compactor: SegmentCompactor, logError: (message: string, err: unknown) => void): CompactAtStart {
  return async (conversationId, access, inputIds, signal) => {
    if (!(await compactor.due(conversationId, access.model))) return null
    try {
      return (await compactor.compact(conversationId, access, 'marks', { inputIds, signal }))?.usage ?? null
    } catch (err) {
      if (signal.aborted) throw err
      logError(`Could not compact conversation ${conversationId}; the turn goes on without it`, err)
      return null
    }
  }
}
