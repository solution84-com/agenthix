/**
 * Reading a time an agent or person typed with no offset ("2026-10-05T09:00")
 * as the wall-clock time it names in a given timezone, rather than in whatever
 * zone the server happens to run in.
 */
import { zonedTimeToUtc } from './scheduleRule'

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/

/**
 * An ISO string with its offset (or Z) is already an instant and is returned
 * unchanged, as is anything else — the caller's validation names what is wrong
 * with it. Only an offset-less date and time is read in `timezone`.
 */
export function readTimeIn<T extends string | null | undefined>(at: T, timezone: string): T | string {
  if (!at) return at
  const m = WALL_CLOCK.exec(at.trim())
  if (!m) return at
  const [year, month, day, hour, minute] = m.slice(1).map(Number)
  return zonedTimeToUtc(year, month, day, hour, minute, timezone).toISOString()
}
