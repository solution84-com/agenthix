import { describe, it, expect } from 'vitest'
import { nextDueAfter, scheduleProblem, parseScheduleRule, zonedParts, type Schedule } from '../scheduleRule'

const utc = (s: string) => new Date(`${s}Z`)

describe('a one-off schedule', () => {
  const s: Schedule = { at: utc('2026-10-03T09:00:00'), rule: null, timezone: 'UTC' }

  it('is due at its time, and then never again', () => {
    expect(nextDueAfter(s, utc('2026-10-03T08:00:00'))).toEqual(utc('2026-10-03T09:00:00'))
    expect(nextDueAfter(s, utc('2026-10-03T09:00:00'))).toBeNull()
  })

  it('cannot be set in the past', () => {
    expect(scheduleProblem(s, utc('2026-10-03T10:00:00'))).toMatch(/future/)
    expect(scheduleProblem(s, utc('2026-10-03T08:00:00'))).toBeNull()
  })
})

describe('a repeat every N minutes or hours', () => {
  const every2h: Schedule = { at: utc('2026-10-03T09:00:00'), rule: { kind: 'interval', every: 2, unit: 'hours' }, timezone: 'UTC' }

  it('starts at its anchor when that is still ahead', () => {
    expect(nextDueAfter(every2h, utc('2026-10-03T08:00:00'))).toEqual(utc('2026-10-03T09:00:00'))
  })

  it('stays on the anchor\'s grid however late a run finished', () => {
    expect(nextDueAfter(every2h, utc('2026-10-03T10:59:00'))).toEqual(utc('2026-10-03T11:00:00'))
    expect(nextDueAfter(every2h, utc('2026-10-03T11:00:00'))).toEqual(utc('2026-10-03T13:00:00'))
  })

  it('after downtime spanning many occurrences, is due once — at the next one after now, not once per missed', () => {
    expect(nextDueAfter(every2h, utc('2026-10-05T10:30:00'))).toEqual(utc('2026-10-05T11:00:00'))
  })

  it('cannot repeat more often than every 5 minutes', () => {
    expect(scheduleProblem({ ...every2h, rule: { kind: 'interval', every: 4, unit: 'minutes' } }, utc('2026-10-03T00:00:00'))).toMatch(/5 minutes/)
    expect(scheduleProblem({ ...every2h, rule: { kind: 'interval', every: 5, unit: 'minutes' } }, utc('2026-10-03T00:00:00'))).toBeNull()
    expect(scheduleProblem({ ...every2h, rule: { kind: 'interval', every: 0, unit: 'hours' } }, utc('2026-10-03T00:00:00'))).not.toBeNull()
  })
})

describe('a daily repeat keeps its wall-clock time in its timezone', () => {
  // Europe/London leaves summer time on 2026-10-25: 09:00 is 08:00Z before, 09:00Z after.
  const daily: Schedule = { at: utc('2026-10-23T08:00:00'), rule: { kind: 'interval', every: 1, unit: 'days' }, timezone: 'Europe/London' }

  it('stays at 09:00 local across the clock change', () => {
    const afterChange = nextDueAfter(daily, utc('2026-10-25T12:00:00'))!
    expect(afterChange).toEqual(utc('2026-10-26T09:00:00'))
    const p = zonedParts(afterChange, 'Europe/London')
    expect([p.hour, p.minute]).toEqual([9, 0])
  })
})

describe('a time of day on given weekdays', () => {
  // 2026-10-03 is a Saturday.
  const weekdays9: Schedule = {
    at: utc('2026-10-01T00:00:00'),
    rule: { kind: 'weekly', time: '09:00', weekdays: [1, 2, 3, 4, 5] },
    timezone: 'America/New_York',
  }

  it('skips the weekend to Monday, at 09:00 in its own timezone', () => {
    const next = nextDueAfter(weekdays9, utc('2026-10-03T15:00:00'))!
    expect(next).toEqual(utc('2026-10-05T13:00:00'))
    const p = zonedParts(next, 'America/New_York')
    expect([p.weekday, p.hour, p.minute]).toEqual([1, 9, 0])
  })

  it('is due later the same day when that time is still ahead', () => {
    expect(nextDueAfter(weekdays9, utc('2026-10-05T12:00:00'))).toEqual(utc('2026-10-05T13:00:00'))
  })

  it('does not start before its start time', () => {
    const later: Schedule = { ...weekdays9, at: utc('2026-10-07T00:00:00') }
    expect(nextDueAfter(later, utc('2026-10-03T15:00:00'))).toEqual(utc('2026-10-07T13:00:00'))
  })

  it('needs a valid time and at least one weekday', () => {
    const now = utc('2026-10-03T00:00:00')
    expect(scheduleProblem({ ...weekdays9, rule: { kind: 'weekly', time: '25:00', weekdays: [1] } }, now)).not.toBeNull()
    expect(scheduleProblem({ ...weekdays9, rule: { kind: 'weekly', time: '09:00', weekdays: [] } }, now)).not.toBeNull()
    expect(scheduleProblem({ ...weekdays9, rule: { kind: 'weekly', time: '09:00', weekdays: [7] } }, now)).not.toBeNull()
  })
})

describe('reading a stored rule and timezone', () => {
  it('refuses an unknown timezone', () => {
    expect(scheduleProblem({ at: utc('2027-01-01T00:00:00'), rule: null, timezone: 'Mars/Olympus' }, utc('2026-10-03T00:00:00'))).toMatch(/timezone/)
  })

  it('parses only the two rule shapes', () => {
    expect(parseScheduleRule({ kind: 'interval', every: 3, unit: 'days' })).toEqual({ kind: 'interval', every: 3, unit: 'days' })
    expect(parseScheduleRule({ kind: 'interval', every: 3, unit: 'weeks' })).toBeNull()
    expect(parseScheduleRule(null)).toBeNull()
    expect(parseScheduleRule('daily')).toBeNull()
  })
})

describe('how long a repeat may be', () => {
  const every = (n: number, unit: 'minutes' | 'hours' | 'days'): Schedule =>
    ({ at: utc('2026-10-03T09:00:00'), rule: { kind: 'interval', every: n, unit }, timezone: 'UTC' })
  const now = utc('2026-10-03T08:00:00')

  it('allows up to a year in any unit', () => {
    expect(scheduleProblem(every(365, 'days'), now)).toBeNull()
    expect(scheduleProblem(every(8760, 'hours'), now)).toBeNull()
    expect(scheduleProblem(every(525_600, 'minutes'), now)).toBeNull()
  })

  it('refuses a repeat past a year, which would run out of valid dates', () => {
    expect(scheduleProblem(every(366, 'days'), now)).toMatch(/365 days/)
    expect(scheduleProblem(every(1e15, 'days'), now)).toMatch(/365 days/)
    expect(scheduleProblem(every(Number.MAX_SAFE_INTEGER, 'minutes'), now)).toMatch(/365 days/)
  })
})
