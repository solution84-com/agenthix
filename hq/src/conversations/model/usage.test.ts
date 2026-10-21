import { describe, expect, it } from 'vitest'
import { turnUsageOf } from './usage'

const usage = (inputTokens: number | undefined, details: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }, outputTokens = 3) =>
  ({
    inputTokens,
    inputTokenDetails: { noCacheTokens: details.noCacheTokens, cacheReadTokens: details.cacheReadTokens, cacheWriteTokens: details.cacheWriteTokens },
    outputTokens,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    totalTokens: undefined,
  }) as Parameters<typeof turnUsageOf>[0]

describe('turnUsageOf @SC-956', () => {
  it('reports the four counts the provider gave', () => {
    expect(turnUsageOf(usage(100, { noCacheTokens: 10, cacheReadTokens: 70, cacheWriteTokens: 20 }))).toEqual({
      inputTokens: 10, outputTokens: 3, cacheReadTokens: 70, cacheWriteTokens: 20,
    })
  })
  it('derives the fresh input when only the total and the cache counts are given', () => {
    expect(turnUsageOf(usage(100, { cacheReadTokens: 60 })).inputTokens).toBe(40)
  })
  it('counts a bare total as input and missing usage as zero', () => {
    expect(turnUsageOf(usage(50, {}))).toMatchObject({ inputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 })
    expect(turnUsageOf(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })
})
