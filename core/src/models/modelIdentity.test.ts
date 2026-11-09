import { describe, expect, it } from 'vitest'
import { makerAndName, sameModelKey } from './modelIdentity.js'

describe('the maker of a model @SC-1863', () => {
  it('reads Inworld\'s google-ai-studio prefix as Google', () => {
    expect(makerAndName('inworld', 'google-ai-studio/gemini-4-argon')).toBe('google/gemini-4-argon')
    expect(sameModelKey('inworld', 'google-ai-studio/gemini-3.1-pro')).toBe(sameModelKey('google', 'gemini-3.1-pro'))
  })
  it('keeps any other provider-listed id as it is', () => {
    expect(makerAndName('inworld', 'anthropic/claude-sonnet-5-5')).toBe('anthropic/claude-sonnet-5-5')
    expect(makerAndName('openrouter', '~anthropic/claude-sonnet-latest')).toBe('anthropic/claude-sonnet-latest')
  })
})
