/** The language Inworld's speech to text is told: English for now, unless hq names one or the settings say detect it. */
import { describe, expect, it } from 'vitest'
import { VOICE_SETTINGS } from '../../settings'
import { readTone } from '../../tone/settings'
import { inworldConfig } from '../index'

const withLanguage = (speechLanguage: 'en' | 'any') => ({ ...VOICE_SETTINGS, tone: { ...VOICE_SETTINGS.tone, speechLanguage } })

describe('the speech language @SC-2242', () => {
  it('is English by default, kept or not', () => {
    expect(VOICE_SETTINGS.tone.speechLanguage).toBe('en')
    expect(readTone({}).speechLanguage).toBe('en')
    expect(readTone({ speechLanguage: 'fr' }).speechLanguage).toBe('en')
    expect(readTone({ speechLanguage: 'any' }).speechLanguage).toBe('any')
  })

  it('tells Inworld English, keeping the rest of hq\'s config', () => {
    expect(inworldConfig({ modelId: 'inworld/inworld-stt-1' }, VOICE_SETTINGS)).toEqual({ modelId: 'inworld/inworld-stt-1', language: 'en' })
    expect(inworldConfig(undefined)).toEqual({ language: 'en' })
  })

  it('names no language when the settings say detect it', () => {
    expect(inworldConfig({ modelId: 'm' }, withLanguage('any'))).toEqual({ modelId: 'm' })
  })

  it('keeps a language hq names', () => {
    expect(inworldConfig({ language: 'de' }, withLanguage('en'))).toEqual({ language: 'de' })
  })
})
