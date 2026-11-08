import { describe, expect, it } from 'vitest'
import { compareRanks, isRank, rankBetween, ranksBetween } from '../rank.js'

describe('a task\'s rank', () => {
  it('places the first task in the middle of the order', () => {
    const r = rankBetween(null, null)
    expect(isRank(r)).toBe(true)
  })

  it('is always strictly between its neighbours, and never ends in 0', () => {
    const pairs: Array<[string | null, string | null]> = [
      [null, '1'], ['1', '2'], ['1', null], ['z', null], ['a', 'a1'], ['1z', '2'], ['a5', 'b'], ['ab', 'ab1'], [null, '01'],
    ]
    for (const [a, b] of pairs) {
      const r = rankBetween(a, b)
      expect(isRank(r), `${a}..${b} gave ${r}`).toBe(true)
      if (a !== null) expect(compareRanks(a, r), `${a} < ${r}`).toBe(-1)
      if (b !== null) expect(compareRanks(r, b), `${r} < ${b}`).toBe(-1)
    }
  })

  it('keeps finding room after many moves into the same gap', () => {
    let lo = rankBetween(null, null)
    const hi = rankBetween(lo, null)
    for (let i = 0; i < 200; i++) {
      const r = rankBetween(lo, hi)
      expect(lo < r && r < hi).toBe(true)
      lo = r
    }
    let hi2 = hi
    for (let i = 0; i < 200; i++) {
      const r = rankBetween(lo, hi2)
      expect(lo < r && r < hi2).toBe(true)
      hi2 = r
    }
  })

  it('spreads several in order', () => {
    const rs = ranksBetween(null, null, 5)
    expect([...rs].sort()).toEqual(rs)
    expect(new Set(rs).size).toBe(5)
  })

  it('refuses neighbours out of order, or what is not a rank', () => {
    expect(() => rankBetween('b', 'a')).toThrow()
    expect(() => rankBetween('a', 'a')).toThrow()
    expect(() => rankBetween('a0', null)).toThrow()
    expect(() => rankBetween('A', null)).toThrow()
    expect(isRank('')).toBe(false)
  })
})
