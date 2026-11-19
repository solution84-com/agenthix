/**
 * What hq does with the light model's answer (adaptive voice listening, spec §When a turn ends and §How its words are
 * played), as one pure rule: whether the answer is sent, the words that play, and how the turn ends. Only a *sounds
 * finished* call ends a turn — `close_turn` alone, `hand_over` to the heavy model, anything else "not yet" — and one
 * with no usable answer in time falls back: the message goes to the heavy model and a stored hold phrase plays. An
 * answer to a call that is no longer the latest is dropped, except `acknowledge`, which plays.
 */
import type { ListenerDecision } from '../listener'

/** What the call came to: the parsed answer, no answer within the time limit, or a call that failed. */
export type ListenResult = { decision: ListenerDecision } | 'timeout' | 'failed'

export interface Settled {
  /** Whether `listened` is sent. */
  send: boolean
  /** The words that play, as a line of the light model's. */
  say: string | null
  /** How the turn ends: closed alone, handed over, or the fallback (handed over, a stored hold phrase plays). */
  turn: 'closed' | 'handedOver' | 'fallback' | null
  /** A *sounds finished* call answered "not yet": the turn stays open, bounded. */
  keepOpen: boolean
}

const NOTHING: Settled = { send: false, say: null, turn: null, keepOpen: false }

export function settle(input: { soundsFinished: boolean; result: ListenResult; stale: boolean }): Settled {
  const { soundsFinished, result, stale } = input
  if (result === 'timeout' || result === 'failed') {
    if (stale) return NOTHING
    return soundsFinished ? { send: true, say: null, turn: 'fallback', keepOpen: false } : { ...NOTHING, send: true }
  }
  const d = result.decision
  // A short acknowledgement still plays when a newer call has come; nothing else of a superseded call does.
  if (stale) return d.tool === 'acknowledge' ? { ...NOTHING, send: true, say: d.say } : NOTHING
  switch (d.tool) {
    case 'close_turn': return { send: true, say: d.say, turn: 'closed', keepOpen: false }
    case 'hand_over': return { send: true, say: d.hold, turn: 'handedOver', keepOpen: false }
    case 'keep_listening': return { send: true, say: null, turn: null, keepOpen: soundsFinished }
    default: return { send: true, say: d.say, turn: null, keepOpen: soundsFinished }
  }
}

/** A turn kept open after the person sounded finished has been quiet for the bound: it goes to the heavy model. */
export function boundReached(quietMs: number, openSince: number, now: number, boundMs: number): boolean {
  return Math.max(quietMs, now - openSince) >= boundMs
}
