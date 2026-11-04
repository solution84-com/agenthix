import { consumeRateLimit, giveBackRateLimit, isRateLimited } from '../server/rateLimit'

// ── Rate limiter (DB-backed) ──────────────────────────────────────────
// Per address, and only failed code attempts count: a person signing up
// through an invite makes several requests and must not use up the budget,
// while someone guessing codes (or the first-admin key) does.
export const RATE_LIMIT_MAX = 10
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const INVITE_RULE = { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS }

export function isInviteRateLimited(ip: string): Promise<boolean> {
  return isRateLimited(ip, INVITE_RULE)
}

export async function recordFailedInviteAttempt(ip: string): Promise<void> {
  await consumeRateLimit(ip, INVITE_RULE)
}

export type InviteAttempt<T> = { limited: true } | { limited: false; result: T }

/**
 * Runs one attempt on a code against the address's budget. The attempt is counted before it runs, so attempts sent
 * at once cannot all be checked before any is counted; one that was not a refusal of the code (a code that works,
 * or a form problem), or that failed for another reason, gives its count back.
 */
export async function attemptInviteCode<T>(
  ip: string,
  run: () => Promise<T>,
  refusedTheCode: (result: T) => boolean,
): Promise<InviteAttempt<T>> {
  if (!(await consumeRateLimit(ip, INVITE_RULE))) return { limited: true }
  let result: T
  try {
    result = await run()
  } catch (err) {
    await giveBackRateLimit(ip)
    throw err
  }
  if (!refusedTheCode(result)) await giveBackRateLimit(ip)
  return { limited: false, result }
}
