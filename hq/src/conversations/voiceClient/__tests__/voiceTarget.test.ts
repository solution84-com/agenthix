import { describe, expect, it } from 'vitest'
import { laidOutTo, revealedChars, spokenReveal, voiceTarget, type TimedSentence } from '../reveal'
import { cutLimit } from '../heardCut'

const text = 'Sure, here is the plan. First we measure. Then we fix it.'
// "Sure, here is the plan." 0-23, "First we measure." 24-41, "Then we fix it." 42-57
const sentences: TimedSentence[] = [
  { index: 0, textStart: 0, textEnd: 23, words: ['Sure', ',', ' ', 'here', 'is', 'the', 'plan', '.'], wordStartSecs: [0, 0.3, 0.3, 0.4, 0.7, 0.9, 1.0, 1.4] },
  { index: 1, textStart: 24, textEnd: 41, words: ['First', 'we', 'measure'], wordStartSecs: [0, 0.3, 0.5] },
  { index: 2, textStart: 42, textEnd: 57, words: ['Then', 'we', 'fix', 'it'], wordStartSecs: [0, 0.2, 0.4, 0.6] },
]
const at = (index: number, elapsed: number, ended = false) => ({ index, elapsed, ended })

describe('where the reveal heads in voice, ahead of the voice @SC-1913', () => {
  it('is nowhere until the voice has begun', () => {
    expect(voiceTarget(text, sentences, null, 0.6)).toBe(0)
  })

  it('glides through a word over the time it is said', () => {
    // "Sure," (0–5) is said from 0 to 0.3 s: halfway through it, halfway across it.
    expect(voiceTarget(text, sentences, at(0, 0), 0.15)).toBeCloseTo(2.5)
  })

  it('holds between words', () => {
    // "Sure" ends at 0.3 s and "here" starts at 0.4 s: in the pause it waits at the start of "here".
    expect(voiceTarget(text, sentences, at(0, 0.3), 0.05)).toBe(6)
    expect(voiceTarget(text, sentences, at(0, 0.3), 0.08)).toBe(6)
  })

  it('is 600 ms ahead of the playhead', () => {
    // At the start, 0.6 s on is two thirds through "here" (6–10, said 0.4–0.7 s).
    expect(voiceTarget(text, sentences, at(0, 0), 0.6)).toBeCloseTo(6 + (0.2 / 0.3) * 4)
  })

  it('runs on into the next sentence when the lead passes the end of this one', () => {
    // 1.2 s + 0.6 s is 0.4 s past "plan" (ends 1.4 s): halfway through "we" (30–32, said 0.3–0.5 s).
    expect(voiceTarget(text, sentences, at(0, 1.2), 0.6)).toBeCloseTo(31)
  })

  it('never goes past the text of the sentences hq has sent', () => {
    expect(voiceTarget(text, sentences.slice(0, 1), at(0, 1.2), 0.6)).toBe(23)
    expect(voiceTarget(text, sentences, at(2, 0.7, true), 0.6)).toBe(57)
  })

  it('uses each word\'s end when hq sends it', () => {
    const timed = sentences.map((s) => (s.index === 1 ? { ...s, wordEndSecs: [0.2, 0.45, 0.9] } : s))
    // "First" ends at 0.2 s, "we" starts at 0.3 s: at 0.25 s it holds at "we".
    expect(voiceTarget(text, timed, at(1, 0), 0.25)).toBe(30)
  })
})

describe('how far the text is laid out @SC-1913', () => {
  it('reaches the end of the sentence being revealed, and no further', () => {
    expect(laidOutTo(text, sentences, 8.7)).toBe(23)
    expect(laidOutTo(text, sentences, 31)).toBe(41)
  })

  it('lays out nothing before the reveal begins', () => {
    expect(laidOutTo(text, sentences, 0)).toBe(0)
  })

  it('is only for the reply being spoken', () => {
    const reveal = { turnId: 't1', head: at(0, 0), sentences }
    expect(spokenReveal(reveal, 't2', text, 0.6)).toBeNull()
    expect(spokenReveal(reveal, 't1', text, 0.6)).toEqual({ layout: 23, target: expect.closeTo(8.67, 1) })
  })
})

describe('what an interruption keeps ignores the lead @SC-1913 @SC-997', () => {
  it('is what was heard, behind where the reveal had got to', () => {
    const head = at(0, 0.5)
    // Heard: "Sure, here" (the two words started). The reveal, 0.6 s ahead, is into "plan.".
    expect(revealedChars(text, sentences, head)).toBe(10)
    expect(cutLimit({ turnId: 't1', head, sentences }, 't1', text)).toBe(10)
    expect(voiceTarget(text, sentences, head, 0.6)).toBeGreaterThan(18)
  })
})
