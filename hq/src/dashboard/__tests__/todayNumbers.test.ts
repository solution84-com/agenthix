import { describe, it, expect } from 'vitest'
import type { RunUsageRow, SiteHealth } from '@agenthix/core'
import { runCount, runningNow, spend, startOfDay, startOfMonth, startOfWeek } from '../todayNumbers'

const health = (running: number, maxAtOnce: number): SiteHealth => ({
  takenAt: '2026-10-10T09:00:00.000Z',
  runs: { running, maxAtOnce },
  disk: null,
  docker: { running: true, version: null },
  agentImage: { name: 'agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
})

const row = (data: Partial<RunUsageRow>): RunUsageRow => ({
  agentId: null, sessionId: null, model: null, onBehalfOfUserId: null, ownerType: null, ownerId: null,
  runCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0,
  lastRunAt: '2026-10-10T09:00:00.000Z',
  ...data,
})

describe('the periods @SC-668', () => {
  it('starts a day at midnight, a week on Monday and a month on the 1st, on hq\'s clock', () => {
    const saturday = new Date(2026, 9, 10, 15, 30)
    expect(startOfDay(saturday)).toEqual(new Date(2026, 9, 10))
    expect(startOfWeek(saturday)).toEqual(new Date(2026, 9, 5))
    expect(startOfMonth(saturday)).toEqual(new Date(2026, 9, 1))
  })

  it('a Monday is its own week\'s start, and a Sunday belongs to the week before', () => {
    expect(startOfWeek(new Date(2026, 9, 5, 8))).toEqual(new Date(2026, 9, 5))
    expect(startOfWeek(new Date(2026, 9, 11, 23))).toEqual(new Date(2026, 9, 5))
  })
})

describe('runningNow @SC-668', () => {
  it('sums running and the most at once over the sites that reported', () => {
    expect(runningNow([health(2, 5), null, health(1, 5)])).toEqual({ running: 3, mostAtOnce: 10, sites: 2 })
    expect(runningNow([])).toEqual({ running: 0, mostAtOnce: 0, sites: 0 })
  })
})

describe('runCount and spend @SC-668', () => {
  it('counts runs across every site\'s rows', () => {
    expect(runCount([row({ runCount: 3 }), row({ runCount: 4 })])).toBe(7)
  })

  it('estimates cost at list price, and counts the tokens of a model with no price apart', () => {
    const result = spend([
      row({ model: 'claude-sonnet-4-6', inputTokens: 1_000_000, totalTokens: 1_000_000 }),
      row({ model: 'unknown-model', totalTokens: 500 }),
    ])
    expect(result.totalTokens).toBe(1_000_500)
    expect(result.unpricedTokens).toBe(500)
    expect(result.costUsd).toBeGreaterThan(0)
  })
})
