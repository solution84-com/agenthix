import { describe, expect, it } from 'vitest'
import type { Voice } from '../../../../voice/ttsAdapter'
import { NO_FILTERS, describeShown, filterVoices, optionsOf } from '../voiceFilter'

const voice = (over: Partial<Voice>): Voice => ({
  voiceId: 'x', displayName: 'X', description: '', languageCode: 'en-US', accent: 'American', gender: 'male', ageGroup: 'middle_aged',
  categories: [], tags: [], source: 'SYSTEM', isCustom: false, ...over,
})

const felix = voice({ voiceId: 'Felix', displayName: 'Felix', description: 'Calm, friendly British male voice', languageCode: 'en-GB', accent: 'British', tags: ['calm', 'friendly'], categories: ['education_training'] })
const clive = voice({ voiceId: 'Clive', displayName: 'Clive', description: 'British-accented male voice with a calm, cordial quality', languageCode: 'en-GB', accent: 'British', tags: ['calm'] })
const penelope = voice({ voiceId: 'Penelope', displayName: 'Penelope', description: 'A refined British female voice', languageCode: 'en-GB', accent: 'British', gender: 'female', ageGroup: 'young' })
const diego = voice({ voiceId: 'Diego', displayName: 'Diego', description: 'Calm Mexican voice', languageCode: 'es-MX', accent: 'Mexican' })
const mine = voice({ voiceId: 'ws__zed', displayName: 'Zed', description: 'Our founder', source: 'IVC', isCustom: true })
const all = [diego, penelope, felix, mine, clive]

describe('the voice filters', () => {
  it('combine, each narrowing the last', () => {
    const f = { ...NO_FILTERS, language: 'en', accent: 'British', gender: 'male' }
    expect(filterVoices(all, f).shown.map(v => v.voiceId)).toEqual(['Clive', 'Felix'])
    expect(filterVoices(all, { ...f, tag: 'friendly' }).shown.map(v => v.voiceId)).toEqual(['Felix'])
    expect(filterVoices(all, { ...f, use: 'education_training' }).shown.map(v => v.voiceId)).toEqual(['Felix'])
    expect(filterVoices(all, { ...NO_FILTERS, age: 'young' }).shown.map(v => v.voiceId)).toEqual(['Penelope'])
  })

  it('search only inside what the filters left, by name and description', () => {
    const f = { ...NO_FILTERS, language: 'en', accent: 'British', gender: 'male', search: 'calm' }
    const { shown, withinFilters } = filterVoices(all, f)
    expect(shown.map(v => v.voiceId)).toEqual(['Clive', 'Felix'])
    expect(withinFilters).toBe(2)
    // "mexican" is in a voice the filters left out, so the search does not bring it back.
    expect(filterVoices(all, { ...f, search: 'mexican' }).shown).toEqual([])
    expect(filterVoices(all, { ...NO_FILTERS, search: 'cordial calm' }).shown.map(v => v.voiceId)).toEqual(['Clive'])
  })

  it('list custom voices first, then by name', () => {
    expect(filterVoices(all, NO_FILTERS).shown.map(v => v.voiceId)).toEqual(['ws__zed', 'Clive', 'Diego', 'Felix', 'Penelope'])
  })

  it('offer the values the voices have', () => {
    const o = optionsOf(all)
    expect(o.languages).toEqual(['en', 'es'])
    expect(o.accents).toEqual(['American', 'British', 'Mexican'])
    expect(o.ages).toEqual(['young', 'middle_aged'])
    expect(o.tags).toEqual(['calm', 'friendly'])
  })

  it('say what is shown and how many', () => {
    const f = { ...NO_FILTERS, language: 'en', accent: 'British', gender: 'male' }
    expect(describeShown(f, 13, 13)).toBe('13 male English voices with a British accent')
    expect(describeShown({ ...f, search: 'calm' }, 2, 13)).toBe('2 of 13 male English voices with a British accent match “calm”')
    expect(describeShown(NO_FILTERS, 5, 5)).toBe('5 voices')
  })
})
