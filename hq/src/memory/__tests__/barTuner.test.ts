/**
 * The probe's bars, tuned per organisation from the last 30 days' outcomes (memory and knowledge spec, What decides
 * a recall: measured, then tuned): a small step a day, only on enough evidence, and always apart and in range.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { BAR_STEP, MIN_SAMPLES, tuneBars, type BarSamples } from '../barTuner'

const start = { certain: 0.62, probable: 0.45 }
const many = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i))
const none: BarSamples = { included: [], hinted: [], missed: [] }

describe('tuneBars @SC-989', () => {
  it('leaves the bars alone with too few outcomes to go on', () => {
    expect(tuneBars(start, none)).toEqual(start)
    expect(tuneBars(start, { ...none, included: many(MIN_SAMPLES - 1, () => ({ similarity: 0.7, used: false })) })).toEqual(start)
  })

  it('raises the certain bar when what it included was seldom relied on', () => {
    const included = many(MIN_SAMPLES, i => ({ similarity: 0.7, used: i < 5 }))
    expect(tuneBars(start, { ...none, included })).toEqual({ certain: 0.64, probable: 0.45 })
  })

  it('lowers the certain bar when the lead mostly read what was only hinted', () => {
    const included = many(MIN_SAMPLES, () => ({ similarity: 0.7, used: true }))
    const hinted = many(MIN_SAMPLES, i => ({ similarity: 0.55, taken: i < 15 }))
    expect(tuneBars(start, { ...none, included, hinted })).toEqual({ certain: 0.6, probable: 0.45 })
  })

  it('raises the probable bar when hints are almost never followed', () => {
    const hinted = many(MIN_SAMPLES, () => ({ similarity: 0.5, taken: false }))
    expect(tuneBars(start, { ...none, hinted })).toEqual({ certain: 0.62, probable: 0.47 })
  })

  it('lowers the probable bar toward the items it missed, one step at most', () => {
    expect(tuneBars(start, { ...none, missed: [0.35, 0.36, 0.38, 0.4, 0.42] })).toEqual({ certain: 0.62, probable: 0.43 })
    expect(tuneBars(start, { ...none, missed: [0.44, 0.44, 0.44, 0.44, 0.44, 0.6] })).toEqual({ certain: 0.62, probable: 0.44 })
  })

  it('counts a miss only below the probable bar, and only once misses are a share of what was shown', () => {
    expect(tuneBars(start, { ...none, missed: [0.5, 0.5, 0.5, 0.5, 0.5] })).toEqual(start)
    const hinted = many(100, () => ({ similarity: 0.5, taken: true }))
    const result = tuneBars(start, { ...none, hinted, missed: [0.3, 0.3, 0.3, 0.3, 0.3] })
    expect(result.probable).toBe(0.45)
  })

  it('keeps the bars apart and in range', () => {
    const hinted = many(MIN_SAMPLES, () => ({ similarity: 0.5, taken: true }))
    expect(tuneBars({ certain: 0.66, probable: 0.62 }, { ...none, hinted })).toEqual({ certain: 0.67, probable: 0.62 })
    const ignored = many(MIN_SAMPLES, () => ({ similarity: 0.85, taken: false }))
    expect(tuneBars({ certain: 0.95, probable: 0.8 }, { ...none, hinted: ignored })).toEqual({ certain: 0.95, probable: 0.8 })
    expect(BAR_STEP).toBe(0.02)
  })
})
