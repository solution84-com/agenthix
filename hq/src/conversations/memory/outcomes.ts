/**
 * Whether the lead relied on what memory gave it (memory and knowledge spec, What decides a recall: measured, then
 * tuned). The lead names the keys it used; every item it was shown in the turn — included by the probe or read by
 * recall — and not named is unused. Two kinds of miss: an item the lead needed and found on its own that the probe
 * had neither included nor hinted, and an item that already said what the person had to correct the lead on.
 */
import type { MemoryOutcomeKindValue } from '../../shared/memory/protocol'

export interface TurnOutcomeRow { itemId: string; kind: MemoryOutcomeKindValue }

export interface Shown {
  included: Set<string>
  hinted: Set<string>
  recalled: Set<string>
  /** Items already marked used or unused in this turn: marking again changes nothing. */
  marked: Set<string>
}

export interface NewOutcome { itemId: string; kind: 'USED' | 'UNUSED' | 'MISSED'; similarity?: number }

export function shownIn(rows: readonly TurnOutcomeRow[]): Shown {
  const of = (...kinds: MemoryOutcomeKindValue[]) => new Set(rows.filter(r => kinds.includes(r.kind)).map(r => r.itemId))
  return { included: of('INCLUDED'), hinted: of('HINTED'), recalled: of('RECALLED'), marked: of('USED', 'UNUSED') }
}

/** `probeScore`: what the probe scored an item in this turn, if it compared it. */
export function useOutcomes(shown: Shown, usedIds: readonly string[], probeScore: (itemId: string) => number | undefined): NewOutcome[] {
  const used = new Set(usedIds)
  const out: NewOutcome[] = []
  for (const id of used) {
    if (shown.marked.has(id)) continue
    out.push({ itemId: id, kind: 'USED' })
    if (shown.recalled.has(id) && !shown.included.has(id) && !shown.hinted.has(id)) {
      const similarity = probeScore(id)
      out.push({ itemId: id, kind: 'MISSED', ...(similarity !== undefined ? { similarity } : {}) })
    }
  }
  for (const id of new Set([...shown.included, ...shown.recalled])) {
    if (!used.has(id) && !shown.marked.has(id)) out.push({ itemId: id, kind: 'UNUSED' })
  }
  return out
}

/**
 * A correction the lead remembers: the held item nearest to it, if it is near enough that a recall would have
 * found it (at the probable bar) and the lead was not already shown it in this turn, is a miss.
 */
export function correctionMiss(
  nearest: { itemId: string; similarity: number } | null,
  probableBar: number,
  shown: Shown,
  probeScore: (itemId: string) => number | undefined,
): NewOutcome | null {
  if (!nearest || nearest.similarity < probableBar) return null
  if (shown.included.has(nearest.itemId) || shown.recalled.has(nearest.itemId)) return null
  const similarity = probeScore(nearest.itemId)
  return { itemId: nearest.itemId, kind: 'MISSED', ...(similarity !== undefined ? { similarity } : {}) }
}
