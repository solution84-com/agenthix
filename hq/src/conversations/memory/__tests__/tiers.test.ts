/** The probe's tiers against the organisation's bars, with the Rule weight (ADR-0188; spec, Recall). */
import { describe, it, expect } from 'vitest'
import { tiersOf } from '../tiers'

const bars = { certain: 0.62, probable: 0.45 }
const s = (itemId: string, similarity: number, score = similarity) => ({ itemId, similarity, score, kind: 'FACT' as const })
const r = (itemId: string, similarity: number, score = similarity) => ({ itemId, similarity, score, kind: 'RULE' as const })
const ids = (items: { itemId: string }[]) => items.map(x => x.itemId)

describe('tiersOf @SC-989', () => {
  it('includes items at or above the certain bar, hints those between the bars, and says nothing of the rest', () => {
    const t = tiersOf([s('a', 0.7), s('b', 0.62), s('c', 0.5), s('d', 0.45), s('e', 0.44)], bars)
    expect(ids(t.certain)).toEqual(['a', 'b'])
    expect(ids(t.probable)).toEqual(['c', 'd'])
    expect(t.certain.every(c => !c.weighted)).toBe(true)
  })

  it('includes at most three, warmest first, and names the next certain ones in the hint, at most three in all', () => {
    const t = tiersOf([s('a', 0.9, 0.5), s('b', 0.8, 0.9), s('c', 0.7, 0.8), s('d', 0.65, 0.6), s('e', 0.5), s('f', 0.48), s('g', 0.46)], bars)
    expect(ids(t.certain)).toEqual(['b', 'c', 'd'])
    expect(ids(t.probable)).toEqual(['a', 'e', 'f'])
  })

  it('leaves out what the turn already shows', () => {
    const t = tiersOf([s('shown', 0.9), s('b', 0.5)], bars, new Set(['shown']))
    expect(t.certain).toEqual([])
    expect(ids(t.probable)).toEqual(['b'])
  })

  it('follows the bars it is given', () => {
    const t = tiersOf([s('a', 0.7), s('b', 0.5)], { certain: 0.75, probable: 0.6 })
    expect(t.certain).toEqual([])
    expect(ids(t.probable)).toEqual(['a'])
  })
})

describe('the Rule weight @SC-2105', () => {
  it('includes in full a Rule that only reached the hint, and marks it weighted', () => {
    const t = tiersOf([r('rule', 0.5), s('fact', 0.5)], bars)
    expect(ids(t.certain)).toEqual(['rule'])
    expect(t.certain[0]!.weighted).toBe(true)
    expect(ids(t.probable)).toEqual(['fact'])
  })

  it('puts Rules first within a tier, ahead of Facts of a higher score', () => {
    const t = tiersOf([s('fact', 0.9), r('rule', 0.7)], bars)
    expect(ids(t.certain)).toEqual(['rule', 'fact'])
    expect(t.certain.map(c => c.weighted)).toEqual([false, false])
  })

  it('leaves a Rule below the hint bar out: the weight acts only on what meaning found', () => {
    const t = tiersOf([r('rule', 0.44)], bars)
    expect(t.certain).toEqual([])
    expect(t.probable).toEqual([])
  })

  it('keeps the caps: a Rule or Fact past the first three moves down to the hint, Rules first', () => {
    const t = tiersOf([r('r1', 0.5), r('r2', 0.55), r('r3', 0.48), r('r4', 0.46), s('f1', 0.9), s('f2', 0.5)], bars)
    expect(ids(t.certain)).toEqual(['r2', 'r1', 'r3'])
    expect(ids(t.probable)).toEqual(['r4', 'f1', 'f2'])
  })
})
