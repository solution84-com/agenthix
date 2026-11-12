/**
 * When the demo resets (live demo spec, *Reset*): every 6 hours, at 00:00, 06:00, 12:00 and 18:00 UTC. hq counts down
 * to it and the host service's timer fires at it, so both read it from here.
 */

export const DEMO_RESET_EVERY_HOURS = 6

const PERIOD_MS = DEMO_RESET_EVERY_HOURS * 60 * 60 * 1000

/** The next reset strictly after `now`: exactly on a reset time gives the one after. */
export function nextDemoReset(now: Date): Date {
  return new Date((Math.floor(now.getTime() / PERIOD_MS) + 1) * PERIOD_MS)
}
