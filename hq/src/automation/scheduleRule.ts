/**
 * Wall-clock times in a timezone, to the minute, for a task's start time (Run at…). A routine's schedule is a cron
 * rule, read in core (`@agenthix/core`'s cron.ts).
 */

const MINUTE_MS = 60_000

/** Start times fall on the minute, as the scheduler ticks (dueTime.ts): rounded up, never earlier. */
export function roundUpToMinute(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / MINUTE_MS) * MINUTE_MS)
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')), minute: Number(get('minute')), weekday: WEEKDAYS.indexOf(get('weekday')),
  }
}

function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000
}

/**
 * The instant a wall-clock time in `tz` names. Day overflow (day 32) rolls into
 * the next month as Date.UTC does. A time inside a spring-forward gap lands an
 * hour later, the same answer a clock that skipped the hour would give.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - offsetMs(new Date(guess), tz)
  const second = guess - offsetMs(new Date(first), tz)
  return new Date(second)
}
