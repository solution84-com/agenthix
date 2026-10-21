/**
 * *Summarise now* on screen, apart from React (walkthrough finding 36): the request returns once the compaction
 * has started, then *Summarising…* shows until its SUMMARISED marker arrives over the socket, or until the
 * socket says it failed, and why.
 */
import type { ConversationMessageView, ConversationSummariseEvent } from '../../shared/conversations/protocol'

export type SummariseView = { state: 'idle' } | { state: 'running' } | { state: 'failed'; reason: string }

export const IDLE: SummariseView = { state: 'idle' }
export const RUNNING: SummariseView = { state: 'running' }
export const COULD_NOT_SUMMARISE = 'The conversation could not be summarised.'

export function summariseOnEvent(_held: SummariseView, e: ConversationSummariseEvent): SummariseView {
  if (e.state === 'started') return RUNNING
  if (e.state === 'ended') return IDLE
  return { state: 'failed', reason: e.reason || COULD_NOT_SUMMARISE }
}

export function summariseOnMessage(held: SummariseView, message: ConversationMessageView): SummariseView {
  return held.state === 'running' && message.kind === 'SUMMARISED' ? IDLE : held
}
