import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_VENDORS, AI_PROVIDER_VENDOR_INFO, isAiProviderState, isAiProviderVendor, modelViaProviderLabel,
  providerTypesCovered,
} from '../providers.js'

describe('providers @SC-1235', () => {
  it('knows every vendor, and Agenthix Cloud as one provider of all three types with no key', () => {
    for (const v of AI_PROVIDER_VENDORS) expect(AI_PROVIDER_VENDOR_INFO[v].types.length).toBeGreaterThan(0)
    expect(AI_PROVIDER_VENDOR_INFO.cloud).toMatchObject({ types: ['llm', 'stt', 'tts'], credential: 'none' })
    expect(AI_PROVIDER_VENDOR_INFO.assemblyai.types).toEqual(['stt'])
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

  it('names a model with the provider that serves it', () => {
    expect(modelViaProviderLabel('Claude Sonnet 5', 'Anthropic')).toBe('Claude Sonnet 5 · via Anthropic')
  })
})
