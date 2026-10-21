import { prisma } from 'wasp/server'
import { Logger } from './utils/logger'

const logger = new Logger('RateLimit')

/**
 * A durable fixed-window counter, keyed by caller-chosen strings so
 * unrelated endpoints do not share a budget. The RateLimit table's key column
 * is named `ip` for its first use; a key here is `<purpose>:<address>`.
 */
export type RateLimitRule = { max: number; windowMs: number }

export const RATE_LIMIT_SWEEP_INTERVAL_MS = 10 * 60 * 1000
let lastSweepAt = 0

/** Deletes every window that has ended — an ended window is treated as absent, so nothing depends on the row. */
export async function sweepExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } })
  return count
}

// There is no scheduler on this path, so the sweep rides on the calls that
// create the rows: at most one per interval per process, and never delaying or failing a caller.
function sweepIfDue(now: Date): void {
  if (now.getTime() - lastSweepAt < RATE_LIMIT_SWEEP_INTERVAL_MS) return
  lastSweepAt = now.getTime()
  sweepExpiredRateLimits().catch(err => logger.error('rate limit sweep failed', err))
}

/**
 * Counts one attempt against `key` and says whether it is within the rule.
 * Each step is a single statement, so concurrent callers cannot both read the
 * same count: an ended window is restarted by a conditional update only one
 * caller can win, and every other attempt is one atomic increment. Refused
 * attempts keep counting, which changes nothing — the window stays refused
 * until it ends.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const now = new Date()
  sweepIfDue(now)
  const resetAt = new Date(now.getTime() + rule.windowMs)

  const restarted = await prisma.rateLimit.updateMany({
    where: { ip: key, resetAt: { lte: now } },
    data: { count: 1, resetAt },
  })
  if (restarted.count > 0) return rule.max >= 1

  const row = await prisma.rateLimit.upsert({
    where: { ip: key },
    create: { ip: key, count: 1, resetAt },
    update: { count: { increment: 1 } },
  })
  return row.count <= rule.max
}

/** Whether `key` has already used its budget in the current window. Counts nothing. */
export async function isRateLimited(key: string, rule: RateLimitRule): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({ where: { ip: key } })
  return row !== null && row.resetAt > new Date() && row.count >= rule.max
}

export async function resetRateLimit(key?: string): Promise<void> {
  if (key) {
    await prisma.rateLimit.deleteMany({ where: { ip: key } })
  } else {
    await prisma.rateLimit.deleteMany({})
  }
}
