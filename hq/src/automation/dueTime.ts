/**
 * When something the scheduler holds counts as due (adr-0088). The scheduler ticks at the top of each minute, and a
 * tick counts everything due within its own minute.
 */

const MINUTE_MS = 60_000

/**
 * A tick's timer can fire a moment before the minute it is for; its minute is
 * read this much later, so a tick at 2:39:59.999 still counts as the 2:40 tick.
 */
export const DUE_GRACE_MS = 2_000

/**
 * The latest due time that counts as due on a tick at `now`: the end of the
 * tick's minute. Something due at 2:40:00.001 — a due time computed a few
 * milliseconds into a tick — fires on the 2:40 tick, not the 2:41 one.
 */
export function dueBy(now: Date): Date {
  const minute = Math.floor((now.getTime() + DUE_GRACE_MS) / MINUTE_MS) * MINUTE_MS
  return new Date(minute + MINUTE_MS - 1)
}
