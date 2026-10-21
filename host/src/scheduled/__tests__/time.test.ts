import { describe, expect, it } from 'vitest'
import { fromNow, parseTime, whenText } from '../time'

// Wednesday 14 October 2026, 09:00 in the machine's own zone.
const now = new Date(2026, 9, 14, 9, 0)
const at = (text: string) => {
  const r = parseTime(text, now)
  return r.ok ? r.at.getTime() : r.problem
}

describe('a time as a person types it @SC-840', () => {
  it('reads a day and a time in the machine’s zone, with or without the weekday and the year', () => {
    expect(at('Sun 18 Oct 02:00')).toBe(new Date(2026, 9, 18, 2, 0).getTime())
    expect(at('Sunday 18 Oct at 02:00')).toBe(new Date(2026, 9, 18, 2, 0).getTime())
    expect(at('18 Oct 2026 02:00')).toBe(new Date(2026, 9, 18, 2, 0).getTime())
    expect(at('2026-10-18 02:00')).toBe(new Date(2026, 9, 18, 2, 0).getTime())
    expect(at('2026-10-18T02:00:00Z')).toBe(Date.parse('2026-10-18T02:00:00Z'))
  })

  it('takes a bare time as its next one, and today or tomorrow as said', () => {
    expect(at('18:00')).toBe(new Date(2026, 9, 14, 18, 0).getTime())
    expect(at('08:00')).toBe(new Date(2026, 9, 15, 8, 0).getTime())
    expect(at('today 08:00')).toBe(new Date(2026, 9, 14, 8, 0).getTime())
    expect(at('tomorrow 02:00')).toBe(new Date(2026, 9, 15, 2, 0).getTime())
  })

  it('takes a date well behind us without a year as next year’s', () => {
    expect(at('2 Jan 10:00')).toBe(new Date(2027, 0, 2, 10, 0).getTime())
  })

  it('refuses, in words, a weekday that does not match its date and a date the calendar does not have', () => {
    expect(at('Fri 18 Oct 02:00')).toBe('18 Oct 2026 is a Sunday, not a Friday. Nothing was scheduled.')
    expect(at('31 Feb 2027 02:00')).toBe('There is no 31 Feb 2027.')
    expect(at('soon')).toMatch(/^Not a time this reads: "soon"\. Write it like/)
    expect(at('25:00')).toMatch(/^Not a time this reads/)
  })
})

describe('a time said back @SC-840', () => {
  it('names the day and the time, and how far off it is', () => {
    expect(whenText(new Date(2026, 9, 18, 2, 0), now)).toBe('Sun 18 Oct at 02:00')
    expect(whenText(new Date(2027, 0, 2, 10, 0), now)).toBe('Sat 2 Jan 2027 at 10:00')
    expect(fromNow(new Date(2026, 9, 14, 9, 25), now)).toBe('in 25 minutes')
    expect(fromNow(new Date(2026, 9, 14, 12, 0), now)).toBe('in about 3 hours')
    expect(fromNow(new Date(2026, 9, 18, 2, 0), now)).toBe('in 4 days')
  })
})
