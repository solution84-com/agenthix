/** The decision rule (semantics spec, §3): the score and the silence so far give an answer. */
import type { TurnAnswer } from '../events'
import type { VoiceSettings } from '../settings'

/** The rule that applies at a mark: the last entry at or before it. */
export function answerAt(pause: VoiceSettings['pause'], markMs: number, score: number): TurnAnswer {
  const entry = [...pause.rule].reverse().find(r => r.atMs <= markMs) ?? pause.rule[0]
  if (!entry) return 'UNCERTAIN'
  if (score >= entry.ready) return 'READY'
  if (entry.keep !== null && score <= entry.keep) return 'KEEP_LISTENING'
  return 'UNCERTAIN'
}

/** A score that still hears the person mid-thought at the last mark: a turn the pause cap ends then, they trailed off. */
export function trailedOff(pause: VoiceSettings['pause'], score: number | null): boolean {
  const keep = [...pause.rule].reverse().find(r => r.keep !== null)?.keep ?? null
  return score !== null && keep !== null && score <= keep
}
