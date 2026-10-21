import { describe, expect, it } from 'vitest'
import { matchesVoiceSearch, voiceAccents, voiceGender } from '@agenthix/ui/agents'

const penelope = { displayName: 'Penelope', description: 'A clear, refined British female voice suited for health and lifestyle assistance.', tags: ['clear'] }
const hamish = { displayName: 'Hamish', description: 'Friendly and casual Australian male voice, ideal for character-driven roles.', tags: ['friendly'] }
const theo = { displayName: 'Theo', description: 'dialect: British English with a South Yorkshire accent\ngender: male\nage: mid-thirties', tags: [] }
const mauricio = { displayName: 'Mauricio', description: 'A serious adult male with a smooth, clear voice.', tags: ['narrative'] }

describe('voice filters @SC-090', () => {
  it('reads gender from the words, never finding "male" inside "female"', () => {
    expect(voiceGender(penelope)).toBe('female')
    expect(voiceGender(hamish)).toBe('male')
    expect(voiceGender(theo)).toBe('male')
  })

  it('reads accents from the words', () => {
    expect(voiceAccents(penelope)).toEqual(['British'])
    expect(voiceAccents(hamish)).toEqual(['Australian'])
    expect(voiceAccents(theo)).toEqual(['British'])
    expect(voiceAccents(mauricio)).toEqual([])
  })

  it('takes each word of a search as its own filter', () => {
    expect(matchesVoiceSearch(theo, 'uk male')).toBe(true)
    expect(matchesVoiceSearch(penelope, 'uk male')).toBe(false)
    expect(matchesVoiceSearch(penelope, 'uk female')).toBe(true)
    expect(matchesVoiceSearch(hamish, 'aussie man friendly')).toBe(true)
    expect(matchesVoiceSearch(hamish, 'british')).toBe(false)
  })

  it('still finds a voice by its name or any word of its description', () => {
    expect(matchesVoiceSearch(mauricio, 'mauri')).toBe(true)
    expect(matchesVoiceSearch(mauricio, 'smooth')).toBe(true)
    expect(matchesVoiceSearch(mauricio, '')).toBe(true)
  })
})
