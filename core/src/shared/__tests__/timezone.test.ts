import { describe, it, expect } from 'vitest'
import { localDateTimeText, normalizeTimezone } from '../timezone.js'

describe('normalizeTimezone', () => {
  it('accepts real IANA zones', () => {
    expect(normalizeTimezone('Australia/Sydney')).toBe('Australia/Sydney')
    expect(normalizeTimezone('America/Indiana/Indianapolis')).toBe('America/Indiana/Indianapolis')
    expect(normalizeTimezone(' Europe/London ')).toBe('Europe/London')
    expect(normalizeTimezone('UTC')).toBe('UTC')
  })

  it('refuses what is not an IANA zone', () => {
    for (const bad of ['', 'Mars/Olympus', '+10:00', 'EST', 'sydney', 'Australia/', 42, null, undefined]) {
      expect(normalizeTimezone(bad)).toBeNull()
    }
  })
})

describe('localDateTimeText', () => {
  it('reads the instant on the person\'s own clock', () => {
    const now = new Date('2026-10-04T04:05:00Z')
    expect(localDateTimeText('Australia/Sydney', now)).toBe('Sunday 4 October 2026, 15:05')
    expect(localDateTimeText('UTC', now)).toBe('Sunday 4 October 2026, 04:05')
  })

  it('can be a different day from UTC', () => {
    expect(localDateTimeText('Australia/Sydney', new Date('2026-10-03T20:00:00Z'))).toBe('Sunday 4 October 2026, 07:00')
  })
})
