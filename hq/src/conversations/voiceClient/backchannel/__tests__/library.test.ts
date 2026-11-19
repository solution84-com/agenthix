import { describe, expect, it } from 'vitest'
import { HUM_KINDS, LAUGH_WORDS } from '../kinds'
import { HUM_LIBRARY, isKindWord, pickWord, toneFor, WARM_SOUNDS } from '../library'

describe('the hum library @SC-2228 @SC-2237', () => {
  it('has about ten listening words a kind, up to four tones, calm among them, and a laugh for amusement only', () => {
    for (const kind of HUM_KINDS) {
      const { words, tones } = HUM_LIBRARY[kind]
      expect(tones.length, kind).toBeGreaterThan(0)
      expect(tones.length, kind).toBeLessThanOrEqual(4)
      if (kind === 'amusement') {
        expect(words).toEqual([LAUGH_WORDS])
        continue
      }
      expect(tones, kind).toContain('calm')
      expect(words.length, kind).toBeGreaterThanOrEqual(10)
      expect(new Set(words).size, kind).toBe(words.length)
      for (const w of words) {
        // No question, no number, no direction, at most three words, never the laugh.
        expect(w, w).not.toMatch(/[?\d[\]]/)
        expect(w.split(/\s+/).length, w).toBeLessThanOrEqual(3)
        expect(w).not.toBe(LAUGH_WORDS)
      }
    }
  })

  it('never offers an opinion, an invitation or a content word', () => {
    const all = HUM_KINDS.flatMap(k => HUM_LIBRARY[k].words).join(' ').toLowerCase()
    for (const word of ['nice', 'great', 'go on', 'good question', 'take your time', 'really', 'tell me']) expect(all).not.toContain(word)
  })

  it('gives a tone the kind does not take its default', () => {
    expect(toneFor('sympathy', 'bright')).toBe('gentle')
    expect(toneFor('sympathy', 'warm')).toBe('warm')
    expect(toneFor('thoughtful', null)).toBe('thoughtful')
    expect(toneFor('amusement', 'calm')).toBe('bright')
  })

  it('knows a kind\'s words without case or the closing stop', () => {
    expect(isKindWord('sympathy', 'oh no')).toBe(true)
    expect(isKindWord('sympathy', 'Oh, her ankle.')).toBe(false)
    expect(isKindWord('continuer', 'Hmm, good question.')).toBe(false)
  })

  it('warms the continuers and receipts in calm, and a laugh', () => {
    expect(WARM_SOUNDS).toEqual([
      { kind: 'continuer', tone: 'calm' }, { kind: 'receipt', tone: 'calm' }, { kind: 'amusement', tone: 'bright' },
    ])
  })
})

describe('picking the word at a breath @SC-2228', () => {
  it('picks at random among the made words, never one of the last three played', () => {
    const made = ['Mm-hm.', 'Mhm.', 'Uh-huh.', 'Mm.']
    const recent = ['Mm-hm.', 'mhm', 'Yeah.']
    const picked = new Set<string>()
    for (let i = 0; i < 20; i++) picked.add(pickWord('continuer', made, recent, () => i / 20)!)
    expect([...picked].sort()).toEqual(['Mm.', 'Uh-huh.'])
  })

  it('picks nothing when every made word was played lately, or none is made', () => {
    expect(pickWord('continuer', ['Mm-hm.'], ['Mm-hm.'], () => 0)).toBeNull()
    expect(pickWord('continuer', [], [], () => 0)).toBeNull()
  })

  it('laughs again however lately it laughed: there is one laugh', () => {
    expect(pickWord('amusement', [LAUGH_WORDS], [LAUGH_WORDS], () => 0.99)).toBe(LAUGH_WORDS)
  })
})
