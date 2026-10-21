// Which provider's credential a run needs, from its runtime and model — pure.
// How the credential itself is resolved is runCredential*.integration.test.ts.
import { describe, it, expect } from 'vitest'
import { providerOfModel } from '../modelCredential'

const SDK = 'claude-sdk'
const OPENCODE = 'opencode'

describe('the provider a run needs', () => {
  it('is Anthropic for any model on the Claude SDK runtime', () => {
    expect(providerOfModel(SDK, 'claude-opus-4-6')).toBe('anthropic')
    expect(providerOfModel(SDK, 'openrouter/qwen/qwen3.8-27b:free')).toBe('anthropic')
  })

  it.each([
    ['openrouter/qwen/qwen3.8-27b:free', 'openrouter'],
    ['openai/gpt-5', 'openai'],
    ['google/gemini-2.5-pro', 'google'],
    ['anthropic/claude-sonnet-4-6', 'anthropic'],
    ['openai_compatible/llama3.3', 'openai_compatible'],
  ])('on OpenCode is the prefix of %s', (model, provider) => {
    expect(providerOfModel(OPENCODE, model)).toBe(provider)
  })

  it.each(['claude-sonnet-4-6', 'mistral/large', '/x', 'openai-compatible/llama'])('on OpenCode is none for %s', model => {
    expect(providerOfModel(OPENCODE, model)).toBeNull()
  })
})
