import { describe, it, expect } from 'vitest'
import { removalText, sinceText } from '../siteWords'

const NOW = new Date(2026, 9, 9, 15, 0)

describe('sinceText @SC-637', () => {
  it('says the time today, yesterday with the time, and the day before that', () => {
    expect(sinceText(new Date(2026, 9, 9, 13, 2), NOW)).toBe('13:02')
    expect(sinceText(new Date(2026, 9, 8, 8, 12), NOW)).toBe('08:12 yesterday')
    expect(sinceText(new Date(2026, 9, 3, 8, 12), NOW)).toBe('08:12 on 3 Oct')
  })
})

describe('removalText @SC-637', () => {
  it('says who removed a site, or that it left', () => {
    const by = { userId: 'u', name: 'Avery', handle: 'avery', avatarUrl: null, state: 'active' } as never
    expect(removalText({ removal: { at: new Date(2026, 9, 5), by, leftByItself: false } }, NOW)).toBe('Removed by Avery on 5 Oct')
    expect(removalText({ removal: { at: new Date(2026, 9, 5), by: null, leftByItself: true } }, NOW)).toBe('Left by itself on 5 Oct')
  })
})
