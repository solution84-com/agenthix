import { describe, expect, it } from 'vitest'
import { revealedChars, type TimedSentence } from '../reveal'

const text = 'Sure, here is the plan. First we measure. Then we fix it.'
// "Sure, here is the plan." 0-23, "First we measure." 24-41, "Then we fix it." 42-57
const sentences: TimedSentence[] = [
  { index: 0, textStart: 0, textEnd: 23, words: ['Sure', ',', ' ', 'here', 'is', 'the', 'plan', '.'], wordStartSecs: [0, 0.3, 0.3, 0.4, 0.7, 0.9, 1.0, 1.4] },
  { index: 1, textStart: 24, textEnd: 41, words: ['First', 'we', 'measure'], wordStartSecs: [0, 0.3, 0.5] },
  { index: 2, textStart: 42, textEnd: 57, words: ['Then', 'we', 'fix', 'it'], wordStartSecs: [0, 0.2, 0.4, 0.6] },
]

describe('how much of the reply has been heard @SC-995', () => {
  it('shows nothing before any audio has played', () => {
    expect(revealedChars(text, sentences, null)).toBe(0)
  })

  it('shows the words spoken so far in the sentence being heard, whole words only', () => {
    const shown = revealedChars(text, sentences, { index: 0, elapsed: 0.8, ended: false })
    expect(text.slice(0, shown)).toBe('Sure, here is')
  })

  it('never shows a word that has not started', () => {
    expect(revealedChars(text, sentences, { index: 1, elapsed: 0.1, ended: false })).toBeGreaterThanOrEqual(24)
    expect(text.slice(0, revealedChars(text, sentences, { index: 1, elapsed: 0.1, ended: false }))).toBe('Sure, here is the plan. First')
  })

  it('shows earlier sentences whole once the next one is playing', () => {
    expect(revealedChars(text, sentences, { index: 2, elapsed: 0, ended: false })).toBeGreaterThanOrEqual(41)
  })

  it('shows the whole sentence once its audio has ended', () => {
    expect(revealedChars(text, sentences, { index: 2, elapsed: 0.7, ended: true })).toBe(57)
  })

  it('does not run past the text it has', () => {
    expect(revealedChars('Short.', sentences, { index: 2, elapsed: 0.7, ended: true })).toBe(6)
  })

  it('does not go backwards as the playhead moves', () => {
    let last = 0
    for (let t = 0; t <= 1.5; t += 0.1) {
      const now = revealedChars(text, sentences, { index: 0, elapsed: t, ended: false })
      expect(now).toBeGreaterThanOrEqual(last)
      last = now
    }
  })
})
