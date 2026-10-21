/**
 * The turns running in this process: how to stop each, and what it has streamed so far, for a screen that
 * joins mid-reply. Held in memory only — the record is the lock and the turn's row; this is what the process
 * running a turn alone can know.
 */
import type { ReplyStepView } from '../../shared/conversations/protocol'
import type { StopReason } from './turn'

export interface LiveTurn {
  turnId: string
  controller: AbortController
  text: string
  /** Its steps so far, and when it began to work, once it has taken one. */
  steps?: { from: Date; steps: ReplyStepView[] }
}

const live = new Map<string, LiveTurn>()

export function startLive(conversationId: string, turnId: string): LiveTurn {
  const entry: LiveTurn = { turnId, controller: new AbortController(), text: '' }
  live.set(conversationId, entry)
  return entry
}

export function endLive(conversationId: string, turnId: string): void {
  if (live.get(conversationId)?.turnId === turnId) live.delete(conversationId)
}

export function liveTurn(conversationId: string): LiveTurn | undefined {
  return live.get(conversationId)
}

/** Stops the turn running here, if any; true when there was one. */
export function stopLive(conversationId: string, reason: StopReason): boolean {
  const entry = live.get(conversationId)
  if (!entry) return false
  if (!entry.controller.signal.aborted) entry.controller.abort(reason)
  return true
}
