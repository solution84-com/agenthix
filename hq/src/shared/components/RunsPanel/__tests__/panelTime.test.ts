import { describe, it, expect } from 'vitest'
import { forText, whenText } from '../panelTime'

const now = new Date(2026, 9, 7, 15, 0)

describe('whenText @SC-524', () => {
  it('gives the clock today, then Yesterday, the weekday, and the date', () => {
    expect(whenText(new Date(2026, 9, 7, 10, 12), now)).toBe('10:12')
    expect(whenText(new Date(2026, 9, 6, 23, 0), now)).toBe('Yesterday')
    expect(whenText(new Date(2026, 9, 5, 9, 0), now)).toBe('Mon')
    expect(whenText(new Date(2026, 7, 20, 9, 0), now)).toBe('20 Aug')
  })
})

describe('forText @SC-524', () => {
  it('counts minutes, never fewer than one, then hours and days', () => {
    expect(forText(new Date(now.getTime() - 10_000), now)).toBe('1 min')
    expect(forText(new Date(now.getTime() - 12 * 60_000), now)).toBe('12 min')
    expect(forText(new Date(now.getTime() - 125 * 60_000), now)).toBe('2 h')
    expect(forText(new Date(now.getTime() - 50 * 3_600_000), now)).toBe('2 d')
  })
})
