import type { MemoryMeasurements, MemoryOutcomeKindValue } from '../../shared/memory/protocol'

export type Counts = Pick<MemoryMeasurements, 'included' | 'hinted' | 'recalled' | 'used' | 'unused' | 'missed'>

const FIELD: Record<MemoryOutcomeKindValue, keyof Counts> = {
  INCLUDED: 'included', HINTED: 'hinted', RECALLED: 'recalled', USED: 'used', UNUSED: 'unused', MISSED: 'missed',
}

/** Outcome counts by kind: how many items were included, hinted, recalled, relied on, not relied on, or missed. */
export function countOutcomes(groups: { kind: string; count: number }[]): Counts {
  const counts: Counts = { included: 0, hinted: 0, recalled: 0, used: 0, unused: 0, missed: 0 }
  for (const g of groups) {
    const field = FIELD[g.kind as MemoryOutcomeKindValue]
    if (field) counts[field] += g.count
  }
  return counts
}

