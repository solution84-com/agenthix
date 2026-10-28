import { describe, it, expect } from 'vitest'
import { lastUsedWords } from '../sections/AboutSection'

describe('"Last used" in words (board U3) @SC-1660', () => {
  it('names the agent, the time today or the day, and the place when the viewer may see it', () => {
    const now = new Date('2026-10-27T15:00:00')
    expect(lastUsedWords({ by: 'Ada', at: new Date('2026-10-27T11:05:00').toISOString(), where: 'Website rebuild' }, now))
      .toMatch(/^Last used by Ada, today .+, in Website rebuild$/)
    expect(lastUsedWords({ by: null, at: new Date('2026-10-20T11:05:00').toISOString(), where: null }, now)).not.toContain('today')
    expect(lastUsedWords({ by: null, at: new Date('2026-10-20T11:05:00').toISOString(), where: null }, now)).not.toContain(' in ')
  })
})
