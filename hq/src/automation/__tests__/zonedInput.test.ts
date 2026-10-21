import { describe, it, expect } from 'vitest'
import { readTimeIn } from '../zonedInput'

describe('readTimeIn', () => {
  it('reads an offset-less time as the wall-clock time in the zone', () => {
    expect(readTimeIn('2026-10-05T09:00', 'Australia/Sydney')).toBe('2026-10-04T22:00:00.000Z')
    expect(readTimeIn('2026-10-05 09:00:30', 'Europe/London')).toBe('2026-10-05T08:00:00.000Z')
  })

  it('keeps the zone\'s own daylight-saving rules', () => {
    expect(readTimeIn('2026-07-05T09:00', 'Australia/Sydney')).toBe('2026-07-04T23:00:00.000Z')
  })

  it('leaves a time with an offset, and anything else, as it was', () => {
    for (const given of ['2026-10-05T09:00:00Z', '2026-10-05T09:00:00+01:00', 'tomorrow', '2026-10-05']) {
      expect(readTimeIn(given, 'Australia/Sydney')).toBe(given)
    }
    expect(readTimeIn(undefined, 'UTC')).toBeUndefined()
    expect(readTimeIn(null, 'UTC')).toBeNull()
  })
})
