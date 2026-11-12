/**
 * The probe's tiers (memory and knowledge spec, What decides a recall; ADR-0188), against the organisation's two
 * bars. Meaning decides what was found: at or above the certain bar an item is included in the turn; between the
 * bars it is named in a one-line hint for the lead to decide on; below, nothing. Then the Rule weight: a Rule found
 * between the bars is included in full instead, and within a tier Rules come before Facts, each by similarity ×
 * warmth. The caps hold — three included, three hinted — and what passes the first cap moves down to the hint.
 */
import { PROBE_CERTAIN_MAX, PROBE_HINT_MAX, type MemoryItemKindValue } from '../../shared/memory/protocol'
import type { Bars } from '../../memory/barTuner'

export interface Scored { itemId: string; similarity: number; score: number; kind: MemoryItemKindValue }

export interface Tiers<T extends Scored> {
  /** `weighted`: a Rule included only because of its kind, which the bar tuner leaves out. */
  certain: (T & { weighted: boolean })[]
  probable: T[]
}

const rulesFirst = <T extends Scored>(a: T, b: T) =>
  Number(b.kind === 'RULE') - Number(a.kind === 'RULE') || b.score - a.score || b.similarity - a.similarity

export function tiersOf<T extends Scored>(scored: readonly T[], bars: Bars, exclude: ReadonlySet<string> = new Set()): Tiers<T> {
  const found = scored.filter(s => !exclude.has(s.itemId) && s.similarity >= bars.probable)
  const lifted = found.filter(s => s.similarity >= bars.certain || s.kind === 'RULE').sort(rulesFirst)
  const certain = lifted.slice(0, PROBE_CERTAIN_MAX).map(s => ({ ...s, weighted: s.similarity < bars.certain }))
  // Past the cap an item is still worth naming: it moves down to the hint, ahead of what only reached it.
  const overflow = lifted.slice(PROBE_CERTAIN_MAX)
  const between = found.filter(s => s.similarity < bars.certain && s.kind !== 'RULE').sort(rulesFirst)
  return { certain, probable: [...overflow, ...between].slice(0, PROBE_HINT_MAX) }
}
