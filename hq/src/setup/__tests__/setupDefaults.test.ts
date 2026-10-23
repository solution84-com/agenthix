import { describe, it, expect } from 'vitest'
import { DEFAULT_LISTENING_MODEL, DEFAULT_VOICE, VOICE_TTS_MODEL } from '../../voice/voiceModels'
import { proposeDefaults, recommendedModels, type ProviderFact } from '../setupDefaults'

const p = (id: string, vendor: ProviderFact['vendor'], state: ProviderFact['state'] = 'works'): ProviderFact => ({ id, vendor, state })
const NONE = { conversation: null, worker: null, stt: null, tts: null }

describe('the models setup recommends', () => {
  it('are Claude Sonnet 5 to talk and Claude Opus 5 for work on an Anthropic key', () => {
    expect(recommendedModels('anthropic')).toEqual({ conversation: 'claude-sonnet-5', worker: 'claude-opus-5' })
  })

  it('are found by the same name behind OpenRouter', () => {
    const r = recommendedModels('openrouter')
    expect(r.conversation).toMatch(/claude-sonnet-5$/)
    expect(r.worker).toMatch(/claude-opus-5$/)
  })

  it('come from the catalogue by price band for a vendor with no preferred model', () => {
    const r = recommendedModels('openai')
    expect(r.conversation).toBeTruthy()
    expect(r.worker).toBeTruthy()
  })

  it('are none for a vendor that reaches no catalogued model', () => {
    expect(recommendedModels('cloud')).toEqual({ conversation: null, worker: null })
    expect(recommendedModels('assemblyai')).toEqual({ conversation: null, worker: null })
  })
})

describe('the defaults setup proposes', () => {
  it('are the recommended models, Inworld TTS 2 speaking as the default voice, and the default listening model', () => {
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], NONE)
    expect(got.conversation).toEqual({ providerId: 'a', model: 'claude-sonnet-5' })
    expect(got.worker).toEqual({ providerId: 'a', model: 'claude-opus-5' })
    expect(got.tts).toEqual({ providerId: 'i', model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE })
    expect(got.stt).toEqual({ providerId: 's', model: DEFAULT_LISTENING_MODEL })
  })

  it('leave alone what is already set', () => {
    const set = { providerId: 'a', model: 'claude-haiku-4-5' }
    const got = proposeDefaults([p('a', 'anthropic'), p('s', 'assemblyai'), p('i', 'inworld')], { ...NONE, conversation: set })
    expect(got.conversation).toEqual(set)
    expect(got.worker).toEqual({ providerId: 'a', model: 'claude-opus-5' })
  })

  it('skip a provider that is not working', () => {
    const got = proposeDefaults([p('a', 'anthropic', 'key_refused'), p('b', 'anthropic'), p('i', 'inworld', 'key_refused')], NONE)
    expect(got.conversation?.providerId).toBe('b')
    expect(got.tts).toBeNull()
  })

  it('put every default on Agenthix Cloud when it is the only provider, models left to Cloud’s own catalogue', () => {
    const got = proposeDefaults([p('c', 'cloud')], NONE)
    expect(got.conversation).toBeNull()
    expect(got.tts).toEqual({ providerId: 'c', model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE })
    expect(got.stt).toEqual({ providerId: 'c', model: DEFAULT_LISTENING_MODEL })
  })
})
