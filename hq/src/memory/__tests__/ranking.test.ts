import { describe, it, expect } from 'vitest'
import { cosine, itemTokens, rank, warmth, type Candidate } from '../ranking'

const now = new Date('2026-10-16T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)

function candidate(key: string, over: Partial<Candidate> = {}): Candidate {
  return {
    key, title: key, body: 'A short body for the item.', pinned: false, similarity: 0.7,
    recallCount: 0, usedCount: 0, lastRecalledAt: null, updatedAt: daysAgo(1), ...over,
  }
}

const keys = (r: { items: { key: string }[] }) => r.items.map(i => i.key)

describe('cosine @SC-988', () => {
  it('is 1 for the same direction, 0 for none, and 0 for vectors of different models', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBe(0)
    expect(cosine([1, 0], [1, 0, 0])).toBe(0)
    expect(cosine([], [])).toBe(0)
  })
})

describe('warmth @SC-988', () => {
  it('rises with use, on a log, so one popular item cannot crowd out the rest', () => {
    const base = warmth(candidate('a'), now)
    const used = warmth(candidate('a', { usedCount: 10 }), now)
    const veryUsed = warmth(candidate('a', { usedCount: 1000 }), now)
    expect(used).toBeGreaterThan(base)
    expect(veryUsed / used).toBeLessThan(used / base + 1)
    expect(veryUsed).toBeLessThan(2 * base)
  })

  it('decays with time since last recalled, and never below a floor', () => {
    const fresh = warmth(candidate('a', { lastRecalledAt: daysAgo(1) }), now)
    const stale = warmth(candidate('a', { lastRecalledAt: daysAgo(90) }), now)
    const ancient = warmth(candidate('a', { lastRecalledAt: daysAgo(3650) }), now)
    expect(stale).toBeLessThan(fresh)
    expect(ancient).toBeGreaterThan(0.5)
  })
})

describe('rank @SC-988', () => {
  const options = { k: 8, tokenBudget: 10_000, now }

  it('orders by similarity × warmth, and drops what the query did not find at all', () => {
    const result = rank([candidate('weak', { similarity: 0.5 }), candidate('strong', { similarity: 0.9 }), candidate('unrelated', { similarity: 0.1 })], options)
    expect(keys(result)).toEqual(['strong', 'weak'])
  })

  it('lets last week\'s item outrank last year\'s of the same similarity, and a direct question still reach the old one', () => {
    const result = rank([
      candidate('last-year', { lastRecalledAt: daysAgo(365) }),
      candidate('last-week', { lastRecalledAt: daysAgo(7) }),
    ], options)
    expect(keys(result)).toEqual(['last-week', 'last-year'])
    const direct = rank([candidate('last-year', { lastRecalledAt: daysAgo(365), similarity: 0.95 }), candidate('last-week', { lastRecalledAt: daysAgo(7), similarity: 0.5 })], options)
    expect(keys(direct)[0]).toBe('last-year')
  })

  it('puts pinned items first', () => {
    const result = rank([candidate('best', { similarity: 0.95 }), candidate('pinned', { similarity: 0.4, pinned: true })], options)
    expect(keys(result)).toEqual(['pinned', 'best'])
  })

  it('cuts at k', () => {
    const many = Array.from({ length: 12 }, (_, i) => candidate(`k${i}`, { similarity: 0.9 - i * 0.01 }))
    expect(keys(rank(many, { ...options, k: 3 }))).toEqual(['k0', 'k1', 'k2'])
  })

  it('cuts at the token budget and names what it cut, keeping a smaller item that still fits', () => {
    const big = candidate('big', { similarity: 0.8, body: 'x'.repeat(800) })
    const small = candidate('small', { similarity: 0.7 })
    const first = candidate('first', { similarity: 0.9 })
    const budget = itemTokens(first) + itemTokens(small)
    const result = rank([big, small, first], { ...options, tokenBudget: budget })
    expect(keys(result)).toEqual(['first', 'small'])
    expect(result.cut).toEqual(['big'])
  })

  it('scores each item it returns', () => {
    const [item] = rank([candidate('a', { similarity: 0.8 })], options).items
    expect(item.score).toBeCloseTo(0.8 * warmth(item, now))
  })
})
