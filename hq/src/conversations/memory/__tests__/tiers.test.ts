/** The probe's three tiers against the organisation's bars (memory and knowledge spec, What decides a recall). */
import { describe, it, expect } from 'vitest'
import { tiersOf } from '../tiers'

const bars = { certain: 0.62, probable: 0.45 }
const s = (itemId: string, similarity: number, score = similarity) => ({ itemId, similarity, score })

describe('tiersOf @SC-989', () => {
  it('includes items at or above the certain bar, hints those between the bars, and says nothing of the rest', () => {
    const t = tiersOf([s('a', 0.7), s('b', 0.62), s('c', 0.5), s('d', 0.45), s('e', 0.44)], bars)
    expect(t.certain.map(x => x.itemId)).toEqual(['a', 'b'])
    expect(t.probable.map(x => x.itemId)).toEqual(['c', 'd'])
  })

  it('includes at most three, warmest first, and names the next certain ones in the hint, at most three in all', () => {
    const t = tiersOf([s('a', 0.9, 0.5), s('b', 0.8, 0.9), s('c', 0.7, 0.8), s('d', 0.65, 0.6), s('e', 0.5), s('f', 0.48), s('g', 0.46)], bars)
    expect(t.certain.map(x => x.itemId)).toEqual(['b', 'c', 'd'])
    expect(t.probable.map(x => x.itemId)).toEqual(['a', 'e', 'f'])
  })

  it('leaves out what the turn already shows, such as pinned items', () => {
    const t = tiersOf([s('pinned', 0.9), s('b', 0.5)], bars, new Set(['pinned']))
    expect(t.certain).toEqual([])
    expect(t.probable.map(x => x.itemId)).toEqual(['b'])
  })

  it('follows the bars it is given', () => {
    const t = tiersOf([s('a', 0.7), s('b', 0.5)], { certain: 0.75, probable: 0.6 })
    expect(t.certain).toEqual([])
    expect(t.probable.map(x => x.itemId)).toEqual(['a'])
  })
})
