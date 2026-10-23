import { describe, expect, it } from 'vitest'
import { monthOf, monthRange, parseMonth } from '../months'

describe('a month cut in the organisation time zone', () => {
  it('is the UTC month in UTC', () => {
    const r = monthRange('2026-10', 'UTC')
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('starts at local midnight on the first, across a change of daylight saving', () => {
    // London is on summer time (UTC+1) on 1 October, and on GMT on 1 November.
    const r = monthRange('2026-10', 'Europe/London')
    expect(r.from.toISOString()).toBe('2026-09-30T23:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('works east of UTC and over the year end', () => {
    const r = monthRange('2026-12', 'Asia/Tokyo')
    expect(r.from.toISOString()).toBe('2026-11-30T15:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })

  it('puts a call in the month of the organisation, not of UTC', () => {
    const at = new Date('2026-10-31T23:30:00Z')
    expect(monthOf(at, 'UTC')).toBe('2026-10')
    expect(monthOf(at, 'Asia/Tokyo')).toBe('2026-11')
    expect(monthOf(new Date('2026-11-01T02:00:00Z'), 'America/New_York')).toBe('2026-10')
  })

  it('reads only a real month', () => {
    expect(parseMonth('2026-10')).toBe('2026-10')
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('26-10')).toBeNull()
    expect(parseMonth(202610)).toBeNull()
  })
})
