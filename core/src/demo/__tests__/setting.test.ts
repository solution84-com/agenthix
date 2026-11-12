import { describe, expect, it } from 'vitest'
import { DEMO_DATA_DIR, DEMO_MODE_ENV, demoDataDir, isDemoMode } from '../setting.js'
import { DEMO_RESET_EVERY_HOURS, nextDemoReset } from '../reset.js'

describe('the demo setting @SC-1981', () => {
  it('is on only when DEMO_MODE is exactly "true"', () => {
    expect(DEMO_MODE_ENV).toBe('DEMO_MODE')
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true)
  })

  it('is off when absent, empty, or anything but exactly "true"', () => {
    for (const value of [undefined, '', 'TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', 'false']) {
      expect(isDemoMode({ DEMO_MODE: value })).toBe(false)
    }
    expect(isDemoMode({})).toBe(false)
  })

  it('reads the data from the fixed image path unless an absolute path is given', () => {
    expect(DEMO_DATA_DIR).toBe('/demo')
    expect(demoDataDir({})).toBe('/demo')
    expect(demoDataDir({ DEMO_DATA_DIR: '' })).toBe('/demo')
    expect(demoDataDir({ DEMO_DATA_DIR: 'relative/demo' })).toBe('/demo')
    expect(demoDataDir({ DEMO_DATA_DIR: '/repo/demo' })).toBe('/repo/demo')
  })
})

describe('the demo reset schedule @SC-1982', () => {
  const at = (iso: string) => nextDemoReset(new Date(iso)).toISOString()

  it('resets every 6 hours', () => {
    expect(DEMO_RESET_EVERY_HOURS).toBe(6)
  })

  it('is the next of 00:00, 06:00, 12:00 and 18:00 UTC', () => {
    expect(at('2026-11-11T00:00:01.000Z')).toBe('2026-11-11T06:00:00.000Z')
    expect(at('2026-11-11T05:59:59.999Z')).toBe('2026-11-11T06:00:00.000Z')
    expect(at('2026-11-11T09:30:00.000Z')).toBe('2026-11-11T12:00:00.000Z')
    expect(at('2026-11-11T17:00:00.000Z')).toBe('2026-11-11T18:00:00.000Z')
  })

  it('is strictly after now: exactly on a boundary gives the next one', () => {
    expect(at('2026-11-11T06:00:00.000Z')).toBe('2026-11-11T12:00:00.000Z')
    expect(at('2026-11-11T00:00:00.000Z')).toBe('2026-11-11T06:00:00.000Z')
  })

  it('crosses midnight, month and year ends', () => {
    expect(at('2026-11-11T18:00:00.000Z')).toBe('2026-11-12T00:00:00.000Z')
    expect(at('2026-11-30T23:10:00.000Z')).toBe('2026-12-01T00:00:00.000Z')
    expect(at('2026-12-31T20:00:00.000Z')).toBe('2027-01-01T00:00:00.000Z')
  })

  it('does not depend on the local time zone', () => {
    const now = new Date(Date.UTC(2026, 10, 11, 13, 0))
    expect(nextDemoReset(now).getTime()).toBe(Date.UTC(2026, 10, 11, 18, 0))
  })
})
