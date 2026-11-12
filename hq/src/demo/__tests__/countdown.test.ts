import { describe, expect, it } from 'vitest'
import { demoFrameWords, nextResetLine, timeLeft } from '../countdown'

const reset = '2026-11-11T18:00:00.000Z'
const at = (iso: string) => Date.parse(iso)

describe('the countdown to the next reset @SC-1974', () => {
  it('says hours and minutes', () => {
    expect(timeLeft(134)).toBe('2 h 14 min')
    expect(timeLeft(120)).toBe('2 h')
    expect(timeLeft(8)).toBe('8 min')
  })

  it('on the entry page @SC-1948', () => {
    expect(nextResetLine(reset, at('2026-11-11T15:46:00Z'))).toBe('Next reset in 2 h 14 min')
  })

  it('on the frame line, and its warning in the last 10 minutes', () => {
    expect(demoFrameWords(reset, at('2026-11-11T15:46:00Z'))).toBe('Demo — shared with other visitors · resets in 2 h 14 min')
    expect(demoFrameWords(reset, at('2026-11-11T17:50:00Z'))).toBe("Resets in 10 min — what you've done here will be wiped")
    expect(demoFrameWords(reset, at('2026-11-11T17:52:00Z'))).toBe("Resets in 8 min — what you've done here will be wiped")
  })

  it('never says 0, even at or past the reset', () => {
    expect(demoFrameWords(reset, at('2026-11-11T18:00:30Z'))).toBe("Resets in 1 min — what you've done here will be wiped")
  })
})
