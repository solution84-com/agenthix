/** Whether the lead relied on what memory gave it, and the two kinds of miss (memory and knowledge spec). */
import { describe, it, expect } from 'vitest'
import { correctionMiss, shownIn, useOutcomes } from '../outcomes'

const shown = shownIn([
  { itemId: 'inc', kind: 'INCLUDED' },
  { itemId: 'inc2', kind: 'INCLUDED' },
  { itemId: 'hint', kind: 'HINTED' },
  { itemId: 'hint', kind: 'RECALLED' },
  { itemId: 'own', kind: 'RECALLED' },
])
const scores: Record<string, number> = { own: 0.31, inc: 0.7 }
const scoreOf = (id: string) => scores[id]

describe('useOutcomes @SC-989', () => {
  it('records each named item used, and each item shown and not named unused', () => {
    const out = useOutcomes(shown, ['inc', 'hint'], scoreOf)
    expect(out).toEqual(expect.arrayContaining([
      { itemId: 'inc', kind: 'USED' },
      { itemId: 'hint', kind: 'USED' },
      { itemId: 'inc2', kind: 'UNUSED' },
      { itemId: 'own', kind: 'UNUSED' },
    ]))
    expect(out).toHaveLength(4)
  })

  it('records a miss, with the probe\'s similarity, for an item the lead found on its own and used', () => {
    expect(useOutcomes(shown, ['own'], scoreOf)).toContainEqual({ itemId: 'own', kind: 'MISSED', similarity: 0.31 })
  })

  it('records no miss for a hinted item the lead followed, nor for a pinned one it was shown', () => {
    const out = useOutcomes(shown, ['hint', 'pinned'], scoreOf)
    expect(out.filter(o => o.kind === 'MISSED')).toEqual([])
    expect(out).toContainEqual({ itemId: 'pinned', kind: 'USED' })
  })

  it('records an unused item once, however often recall returned it, and marks nothing twice', () => {
    const again = shownIn([{ itemId: 'x', kind: 'RECALLED' }, { itemId: 'x', kind: 'RECALLED' }, { itemId: 'y', kind: 'USED' }, { itemId: 'y', kind: 'INCLUDED' }])
    expect(useOutcomes(again, ['y'], () => undefined)).toEqual([{ itemId: 'x', kind: 'UNUSED' }])
  })
})

describe('correctionMiss @SC-989', () => {
  it('is a miss when an item near enough was held and the lead was not shown it', () => {
    expect(correctionMiss({ itemId: 'held', similarity: 0.6 }, 0.45, shown, () => 0.2)).toEqual({ itemId: 'held', kind: 'MISSED', similarity: 0.2 })
  })

  it('is no miss when nothing held was near, or the lead had it in front of it', () => {
    expect(correctionMiss(null, 0.45, shown, scoreOf)).toBeNull()
    expect(correctionMiss({ itemId: 'held', similarity: 0.4 }, 0.45, shown, scoreOf)).toBeNull()
    expect(correctionMiss({ itemId: 'inc', similarity: 0.9 }, 0.45, shown, scoreOf)).toBeNull()
    expect(correctionMiss({ itemId: 'own', similarity: 0.9 }, 0.45, shown, scoreOf)).toBeNull()
  })
})
