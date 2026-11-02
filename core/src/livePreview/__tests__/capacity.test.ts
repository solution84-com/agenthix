import { describe, expect, it } from 'vitest'
import {
  LIVE_PREVIEWS_MEMORY_HIGH_PERCENT, LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT, memoryBand, parseLivePreviewsCapacity, percentOf,
} from '../capacity.js'

describe('what live previews use @SC-1759 @SC-1755', () => {
  it('works out whole percents', () => {
    expect(percentOf(81, 100)).toBe(81)
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(1, 0)).toBeNull()
    expect(percentOf(-1, 10)).toBeNull()
  })

  it('is high above the high mark, and recovers only under the recovered one', () => {
    expect(LIVE_PREVIEWS_MEMORY_HIGH_PERCENT).toBe(80)
    expect(LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT).toBeLessThan(LIVE_PREVIEWS_MEMORY_HIGH_PERCENT)
    expect(memoryBand('normal', LIVE_PREVIEWS_MEMORY_HIGH_PERCENT)).toBe('normal')
    expect(memoryBand('normal', LIVE_PREVIEWS_MEMORY_HIGH_PERCENT + 1)).toBe('high')
    expect(memoryBand('high', LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT + 5)).toBe('high')
    expect(memoryBand('high', LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT - 1)).toBe('normal')
    expect(memoryBand('high', null)).toBe('high')
  })

  it('is read closed', () => {
    const c = { open: 2, limit: null, memoryPercent: 64, cpuPercent: 130 }
    expect(parseLivePreviewsCapacity(c)).toEqual(c)
    expect(parseLivePreviewsCapacity({ ...c, limit: 6, memoryPercent: null, cpuPercent: null }))
      .toEqual({ ...c, limit: 6, memoryPercent: null, cpuPercent: null })
    expect(parseLivePreviewsCapacity({ ...c, extra: 1 })).toBeNull()
    expect(parseLivePreviewsCapacity({ ...c, memoryPercent: 101 })).toBeNull()
    expect(parseLivePreviewsCapacity({ ...c, open: -1 })).toBeNull()
    expect(parseLivePreviewsCapacity({ ...c, limit: 0 })).toBeNull()
    const { cpuPercent: _c, ...missing } = c
    expect(parseLivePreviewsCapacity(missing)).toBeNull()
  })
})
