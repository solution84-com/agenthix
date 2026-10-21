/**
 * The probe's three tiers (memory and knowledge spec, What decides a recall), against the organisation's two bars:
 * at or above the certain bar an item is included in the turn, at most three; between the bars it is named in a
 * one-line hint, at most three, for the lead to decide on; below, nothing. Membership is by similarity alone — the
 * bars are calibrated on it — and within a tier the warmer item comes first (similarity × warmth).
 */
import { PROBE_CERTAIN_MAX, PROBE_HINT_MAX } from '../../shared/memory/protocol'
import type { Bars } from '../../memory/barTuner'

export interface Scored { itemId: string; similarity: number; score: number }

export interface Tiers<T extends Scored> {
  certain: T[]
  probable: T[]
}

export function tiersOf<T extends Scored>(scored: readonly T[], bars: Bars, exclude: ReadonlySet<string> = new Set()): Tiers<T> {
  const byScore = [...scored].filter(s => !exclude.has(s.itemId)).sort((a, b) => b.score - a.score || b.similarity - a.similarity)
  const certainAll = byScore.filter(s => s.similarity >= bars.certain)
  // An item past the certain cap is still worth naming: it moves down to the hint.
  const certain = certainAll.slice(0, PROBE_CERTAIN_MAX)
  const overflow = certainAll.slice(PROBE_CERTAIN_MAX)
  const between = byScore.filter(s => s.similarity >= bars.probable && s.similarity < bars.certain)
  const probable = [...overflow, ...between].slice(0, PROBE_HINT_MAX)
  return { certain, probable }
}
