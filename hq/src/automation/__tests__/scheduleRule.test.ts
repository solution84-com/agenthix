import { describe, it, expect } from 'vitest'
import { isValidTimezone, roundUpToMinute, zonedParts, zonedTimeToUtc } from '../scheduleRule'

const utc = (s: string) => new Date(`${s}Z`)

describe('a start time on the minute', () => {
  it('rounds up, never earlier', () => {
    expect(roundUpToMinute(utc('2026-10-03T09:00:00.001'))).toEqual(utc('2026-10-03T09:01:00'))
    expect(roundUpToMinute(utc('2026-10-03T09:00:00'))).toEqual(utc('2026-10-03T09:00:00'))
  })
})

describe('a wall-clock time in a timezone', () => {
  it('names the instant on either side of a clock change', () => {
    // Europe/London leaves summer time on 2026-10-25: 09:00 is 08:00Z before, 09:00Z after.
    expect(zonedTimeToUtc(2026, 10, 24, 9, 0, 'Europe/London')).toEqual(utc('2026-10-24T08:00:00'))
    expect(zonedTimeToUtc(2026, 10, 26, 9, 0, 'Europe/London')).toEqual(utc('2026-10-26T09:00:00'))
    const p = zonedParts(utc('2026-10-26T09:00:00'), 'Europe/London')
    expect([p.hour, p.minute, p.weekday]).toEqual([9, 0, 1])
  })

  it('refuses an unknown timezone', () => {
    expect(isValidTimezone('Europe/London')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
  })
})
