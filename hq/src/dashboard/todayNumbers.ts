/**
 * Today's numbers (every screen reviewed spec §3, Organisation, for admins):
 * running now of the most at once, runs today, tasks done this week, and spend
 * this month, estimated. Pure: `todayQueries.ts` reads the sites and the rows.
 *
 * Days, weeks and months are hq's own clock's; a week starts on Monday.
 */
import type { RunUsageRow, SiteHealth } from '@agenthix/core'
import { calculateCost, MODEL_PRICING } from '../shared/utils/aiMetrics'

export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function startOfWeek(now: Date): Date {
  const day = startOfDay(now)
  const sinceMonday = (day.getDay() + 6) % 7
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday)
}

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/** Running now and the most at once, summed over the sites that are connected and reported. */
export function runningNow(healths: Array<SiteHealth | null>): { running: number; mostAtOnce: number; sites: number } {
  const reported = healths.filter((h): h is SiteHealth => h !== null)
  return {
    running: reported.reduce((n, h) => n + h.runs.running, 0),
    mostAtOnce: reported.reduce((n, h) => n + h.runs.maxAtOnce, 0),
    sites: reported.length,
  }
}

export function runCount(rows: RunUsageRow[]): number {
  return rows.reduce((n, r) => n + r.runCount, 0)
}

/** Estimated at each model's list price; tokens of a model with no price are counted apart, never as free. */
export function spend(rows: RunUsageRow[]): { costUsd: number; totalTokens: number; unpricedTokens: number } {
  let costUsd = 0
  let totalTokens = 0
  let unpricedTokens = 0
  for (const row of rows) {
    totalTokens += row.totalTokens
    if (row.model && MODEL_PRICING[row.model]) costUsd += calculateCost(row, row.model)
    else unpricedTokens += row.totalTokens
  }
  return { costUsd, totalTokens, unpricedTokens }
}
