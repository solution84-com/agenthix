import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_VENDORS, AI_PROVIDER_VENDOR_INFO, isAiProviderState, isAiProviderVendor, modelViaProviderLabel,
  providerTypesCovered, providerTypesOf,
} from '../providers.js'

describe('providers @SC-1235', () => {
  it('knows every vendor, and Agenthix Cloud as one provider of all three types with no key', () => {
    for (const v of AI_PROVIDER_VENDORS) expect(AI_PROVIDER_VENDOR_INFO[v].types.length).toBeGreaterThan(0)
    expect(AI_PROVIDER_VENDOR_INFO.cloud).toMatchObject({ types: ['llm', 'stt', 'tts'], credential: 'none' })
    expect(AI_PROVIDER_VENDOR_INFO.assemblyai.types).toEqual(['stt'])
    expect(AI_PROVIDER_VENDOR_INFO.inworld).toMatchObject({ types: ['llm', 'stt', 'tts'], credential: 'api_key', hasAddress: false })
    expect(AI_PROVIDER_VENDOR_INFO.openai_compatible.hasAddress).toBe(true)
    expect(isAiProviderVendor('deepseek')).toBe(false)
    expect(isAiProviderState('key_refused')).toBe(true)
    expect(isAiProviderState('rate_limited')).toBe(false)
  })

  it('covers a type only when a provider of it works', () => {
    const own = [
      { vendor: 'openrouter' as const, state: 'works' as const },
      { vendor: 'assemblyai' as const, state: 'works' as const },
      { vendor: 'inworld' as const, state: 'key_refused' as const },
    ]
    expect(providerTypesCovered(own)).toEqual({ llm: true, stt: true, tts: false })
    expect(providerTypesCovered([{ vendor: 'cloud', state: 'works' }])).toEqual({ llm: true, stt: true, tts: true })
    expect(providerTypesCovered([{ vendor: 'cloud', state: 'not_available' }])).toEqual({ llm: false, stt: false, tts: false })
  })

  it('counts Inworld as a language-model provider with no switch @SC-1864', () => {
    const one = [{ vendor: 'inworld' as const, state: 'works' as const }]
    // One Inworld key, one provider row: models, hearing and speaking.
    expect(providerTypesCovered(one)).toEqual({ llm: true, stt: true, tts: true })
    expect(providerTypesOf('inworld')).toEqual(['llm', 'stt', 'tts'])
    expect(providerTypesOf('anthropic')).toEqual(['llm'])
    // A provider as hq reads it carries its types, and those are used as given.
    expect(providerTypesCovered([{ ...one[0], types: ['stt'] }])).toEqual({ llm: false, stt: true, tts: false })
    expect(providerTypesCovered([{ vendor: 'inworld', state: 'key_refused' }])).toEqual({ llm: false, stt: false, tts: false })
  })

  it('names a model with the provider that serves it', () => {
    expect(modelViaProviderLabel('Claude Sonnet 5', 'Anthropic')).toBe('Claude Sonnet 5 · via Anthropic')
  })
})
