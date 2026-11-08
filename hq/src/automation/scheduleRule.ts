/**
 * A routine's schedule (spec §3, adr-0092): a repeat rule — every N
 * minutes, hours or days, or a time of day on given weekdays — read in a stored
 * timezone. Pure: the scheduler stores what `nextDueAfter` returns and moves
 * the routine on to its next round when that time arrives.
 *
 * An interval rule is anchored at the schedule's start time, so "every 2 hours
 * from 09:00" stays on the even hours however late a round is dealt with. Days are
 * counted on the wall clock in the rule's timezone, so a daily 09:00 stays at
 * 09:00 across a daylight-saving change; minutes and hours are elapsed time.
 */
import { AUTOMATION_INTERVAL_FLOOR_MINUTES } from './automationSettings'

const MINUTE_MS = 60_000

/** Round times fall on the minute, as the scheduler ticks (dueTime.ts): rounded up, never shortening an interval. */
export function roundUpToMinute(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / MINUTE_MS) * MINUTE_MS)
}

export type IntervalUnit = 'minutes' | 'hours' | 'days'

export type ScheduleRule =
  | { kind: 'interval'; every: number; unit: IntervalUnit }
  /** `time` is HH:MM on the 24-hour clock; weekdays are 0 (Sunday) to 6. */
  | { kind: 'weekly'; time: string; weekdays: number[] }

export interface Schedule {
  /** A one-off's time; a repeat's anchor (interval) or earliest start (weekly). */
  at: Date
  rule: ScheduleRule | null
  timezone: string
}

/** A repeat longer than a year is out of the range of dates the schedule is worked out in. */
const INTERVAL_CEILING_MINUTES = 365 * 24 * 60
const UNIT_MINUTES: Record<IntervalUnit, number> = { minutes: 1, hours: 60, days: 24 * 60 }
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseScheduleRule(value: unknown): ScheduleRule | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.kind === 'interval' && typeof v.every === 'number' && (v.unit === 'minutes' || v.unit === 'hours' || v.unit === 'days')) {
    return { kind: 'interval', every: v.every, unit: v.unit }
  }
  if (v.kind === 'weekly' && typeof v.time === 'string' && Array.isArray(v.weekdays) && v.weekdays.every(d => typeof d === 'number')) {
    return { kind: 'weekly', time: v.time, weekdays: [...(v.weekdays as number[])] }
  }
  return null
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Why a schedule cannot be set, or null when it can. `now` decides whether a one-off is already past. */
export function scheduleProblem(s: Schedule, now: Date): string | null {
  if (Number.isNaN(s.at.getTime())) return 'The start time is not a valid time'
  if (!isValidTimezone(s.timezone)) return `"${s.timezone}" is not a timezone`
  const rule = s.rule
  if (rule === null) {
    return s.at.getTime() <= now.getTime() ? 'A one-off start time must be in the future' : null
  }
  if (rule.kind === 'interval') {
    if (!Number.isInteger(rule.every) || rule.every < 1) return 'A repeat must be every whole number of minutes, hours or days'
    if (rule.every * UNIT_MINUTES[rule.unit] < AUTOMATION_INTERVAL_FLOOR_MINUTES) {
      return `A task cannot repeat more often than every ${AUTOMATION_INTERVAL_FLOOR_MINUTES} minutes`
    }
    if (rule.every * UNIT_MINUTES[rule.unit] > INTERVAL_CEILING_MINUTES) return 'A task cannot repeat less often than every 365 days'
    return null
  }
  if (!TIME_OF_DAY.test(rule.time)) return 'The time of day must be HH:MM on the 24-hour clock'
  if (rule.weekdays.length === 0) return 'Choose at least one day of the week'
  if (rule.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Days of the week are 0 (Sunday) to 6 (Saturday)'
  return null
}

/** The first time strictly after `after` the schedule is due, or null when a one-off has passed. */
export function nextDueAfter(s: Schedule, after: Date): Date | null {
  const rule = s.rule
  if (rule === null) return s.at.getTime() > after.getTime() ? s.at : null
  if (s.at.getTime() > after.getTime() && rule.kind === 'interval') return s.at
  if (rule.kind === 'interval') {
    if (rule.unit === 'days') return nextByDays(s.at, rule.every, after, s.timezone)
    const periodMs = rule.every * UNIT_MINUTES[rule.unit] * 60_000
    const k = Math.floor((after.getTime() - s.at.getTime()) / periodMs) + 1
    return new Date(s.at.getTime() + k * periodMs)
  }
  return nextWeekly(rule, s.at.getTime() > after.getTime() ? new Date(s.at.getTime() - 1) : after, s.timezone)
}

function nextByDays(anchor: Date, every: number, after: Date, tz: string): Date {
  const a = zonedParts(anchor, tz)
  const approxDays = Math.floor((after.getTime() - anchor.getTime()) / 86_400_000)
  let k = Math.max(0, Math.floor(approxDays / every) - 1)
  for (;;) {
    const candidate = zonedTimeToUtc(a.year, a.month, a.day + k * every, a.hour, a.minute, tz)
    if (candidate.getTime() > after.getTime()) return candidate
    k++
  }
}

function nextWeekly(rule: { time: string; weekdays: number[] }, after: Date, tz: string): Date {
  const [hh, mm] = rule.time.split(':').map(Number)
  const start = zonedParts(after, tz)
  for (let i = 0; i <= 7; i++) {
    const candidate = zonedTimeToUtc(start.year, start.month, start.day + i, hh, mm, tz)
    const weekday = zonedParts(candidate, tz).weekday
    if (rule.weekdays.includes(weekday) && candidate.getTime() > after.getTime()) return candidate
  }
  // Unreachable with at least one weekday; a week on is always due.
  return new Date(after.getTime() + 7 * 86_400_000)
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
