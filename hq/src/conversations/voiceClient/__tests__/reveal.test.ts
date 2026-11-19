import { describe, expect, it } from 'vitest'
import { revealedChars, revealedCharsAfter, spokenReveal, type TimedSentence } from '../reveal'

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

describe('a reply that starts with the lines already heard (the light model)', () => {
  const heard = 'Let me look at that.'
  const stored = `${heard}\n\n${text}`
  const at = heard.length + 2

  it('shows the lines heard whole before any of the reply is heard', () => {
    expect(revealedCharsAfter(stored, sentences, null, heard)).toBe(heard.length)
  })

  it('keeps the reply in step with the voice, as with no lines before it', () => {
    const shown = revealedCharsAfter(stored, sentences, { index: 0, elapsed: 0.8, ended: false }, heard)
    expect(stored.slice(0, shown)).toBe(`${heard}\n\nSure, here is`)
    expect(shown - at).toBe(revealedChars(text, sentences, { index: 0, elapsed: 0.8, ended: false }))
  })

  it('shows all of it once the last sentence has ended', () => {
    expect(revealedCharsAfter(stored, sentences, { index: 2, elapsed: 0.7, ended: true }, heard)).toBe(stored.length)
  })

  it('is the plain reveal when the text does not start with the lines (not stored yet, or rewritten)', () => {
    const head = { index: 1, elapsed: 0.1, ended: false }
    expect(revealedCharsAfter(text, sentences, head, heard)).toBe(revealedChars(text, sentences, head))
    expect(revealedCharsAfter(stored, sentences, head, undefined)).toBe(revealedChars(stored, sentences, head))
  })

  it('lays the reply out and heads the reveal after the lines', () => {
    const reveal = { turnId: 't1', head: null, sentences, heardPrefix: heard }
    expect(spokenReveal(reveal, 't1', stored, 0)).toEqual({ layout: heard.length, target: heard.length })
    const going = spokenReveal({ ...reveal, head: { index: 0, elapsed: 0.8, ended: false } }, 't1', stored, 0)!
    expect(going.target).toBeGreaterThan(at)
    expect(going.layout).toBe(at + 23)
    expect(spokenReveal({ ...reveal, heardPrefix: undefined, head: null }, 't1', text, 0)).toEqual({ layout: 0, target: 0 })
  })
})
