/**
 * The recap (spec §The recap, corrected): one small call to the heavy model after each reply, from the previous recap,
 * the person's message and this turn's agent message, writing under 100 words; and its reading: trimmed, nothing when
 * empty, and a long one cut at a sentence, else at a word, never mid-word.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_SETTINGS, listenerSettingsWith } from '../settings'
import { RECAP_INSTRUCTIONS_VERSION, buildRecapCall, readRecap } from '../recap'

const input = {
  agent: 'Kernel', person: 'Sam', previousRecap: 'Sam is planning a weekend in Melbourne.',
  message: "What's the weather going to be like on Saturday?",
  agentMessage: 'Good question, let me check. Saturday looks mild, about nineteen degrees, with showers late.',
}

describe('buildRecapCall @SC-2217', () => {
  it('reads the previous recap, the person\'s message and this turn\'s agent message, and nothing else', () => {
    const c = buildRecapCall(input)
    expect(c.user).toContain('Sam is planning a weekend in Melbourne.')
    expect(c.user).toContain("What's the weather going to be like on Saturday?")
    expect(c.user).toContain('Saturday looks mild')
    expect(c.system).toContain('100 words')
    expect(c.system).not.toContain('Sam is planning')
    expect(RECAP_INSTRUCTIONS_VERSION).toBeGreaterThan(0)
  })

  it('says when there is no recap yet', () => {
    expect(buildRecapCall({ ...input, previousRecap: null }).user).toContain('(none yet)')
  })

  it('keeps the instructions the same from call to call, and takes its cap from the settings', () => {
    expect(buildRecapCall(input).system).toBe(buildRecapCall({ ...input, message: 'Other.' }).system)
    expect(buildRecapCall(input, listenerSettingsWith({ recapMaxWords: 60 })).system).toContain('60 words')
  })

  it('caps long inputs', () => {
    const long = 'word '.repeat(5000)
    const c = buildRecapCall({ ...input, message: long, agentMessage: long, previousRecap: long })
    expect(c.user.length).toBeLessThan(long.length)
  })
})

describe('readRecap @SC-2217', () => {
  it('trims, and drops wrapping quotes or a label', () => {
    expect(readRecap('  Sam wants the weekend weather.  ')).toBe('Sam wants the weekend weather.')
    expect(readRecap('"Sam wants the weekend weather."')).toBe('Sam wants the weekend weather.')
    expect(readRecap('Recap: Sam wants the weekend weather.')).toBe('Sam wants the weekend weather.')
  })

  it('is nothing when empty', () => {
    expect(readRecap('')).toBeNull()
    expect(readRecap('   \n ')).toBeNull()
    expect(readRecap('""')).toBeNull()
  })

  it('keeps a recap within the cap as it is', () => {
    const ok = Array.from({ length: LISTENER_SETTINGS.recapMaxWords }, () => 'word').join(' ')
    expect(readRecap(ok)).toBe(ok)
  })

  it('cuts a long one at the last sentence that fits', () => {
    const settings = listenerSettingsWith({ recapMaxWords: 20 })
    const text = 'Sam is planning a weekend in Melbourne. They asked about the weather on Saturday. ' +
      'Still open: whether to take the train or fly, and where to stay near the station on Friday night.'
    expect(readRecap(text, settings)).toBe('Sam is planning a weekend in Melbourne. They asked about the weather on Saturday.')
  })

  it('cuts at a word when no sentence fits, never mid-word', () => {
    const settings = listenerSettingsWith({ recapMaxWords: 20 })
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const out = readRecap(text, settings)!
    expect(out.split(/\s+/)).toHaveLength(20)
    expect(out.endsWith('word19…')).toBe(true)
  })
})
