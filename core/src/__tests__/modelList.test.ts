import { describe, it, expect } from 'vitest'
import {
  OPENCODE_MODELS, CLAUDE_SDK_MODELS, modelsForRuntime, isKnownModel, isTypedModel, typedModelValue,
} from '../models/index.js'

const rankOf = (value: string) => OPENCODE_MODELS.find(m => m.value === value)?.costRank

describe('the generated OpenCode model list', () => {
  it('holds models of the four catalogue providers only, each value naming its provider', () => {
    const providers = new Set(OPENCODE_MODELS.map(m => m.provider))
    expect([...providers].sort()).toEqual(['anthropic', 'google', 'openai', 'openrouter'])
    for (const m of OPENCODE_MODELS) expect(m.value.startsWith(`${m.provider}/`)).toBe(true)
  })

  it('has unique values', () => {
    expect(new Set(OPENCODE_MODELS.map(m => m.value)).size).toBe(OPENCODE_MODELS.length)
  })

  it('includes OpenRouter free models and its free router, ranked 0', () => {
    for (const value of ['openrouter/openrouter/free', 'openrouter/google/gemma-4-31b-it:free']) {
      expect(rankOf(value)).toBe(0)
    }
    expect(OPENCODE_MODELS.filter(m => m.value.endsWith(':free')).length).toBeGreaterThan(5)
  })

  it('ranks by price: a mini model below its flagship, Haiku below Opus', () => {
    const rank = (v: string) => rankOf(v) as number
    expect(rank('anthropic/claude-haiku-4-5')).toBeLessThan(rank('anthropic/claude-opus-4-8'))
    expect(rank('openai/gpt-5-nano')).toBeLessThan(rank('anthropic/claude-haiku-4-5'))
  })
})

describe('models per runtime', () => {
  it('keeps Anthropic bare ids on the Claude runtime and the catalogue on OpenCode', () => {
    expect(modelsForRuntime('claude-sdk')).toBe(CLAUDE_SDK_MODELS)
    expect(modelsForRuntime('opencode')).toBe(OPENCODE_MODELS)
    expect(isKnownModel('claude-sdk', 'anthropic/claude-sonnet-4-6')).toBe(false)
    expect(isKnownModel('opencode', 'claude-sonnet-4-6')).toBe(false)
    expect(modelsForRuntime('unknown')).toEqual([])
  })
})

describe('a typed model for an OpenAI-compatible endpoint', () => {
  it('is the endpoint’s own model name after the provider prefix', () => {
    expect(typedModelValue(' llama3.1:8b ')).toBe('openai_compatible/llama3.1:8b')
    expect(isTypedModel('openai_compatible/llama3.1:8b')).toBe(true)
    for (const bad of ['openai_compatible/', 'openai_compatible/a b', 'openai_compatible/ x', 'llama3']) {
      expect(isTypedModel(bad)).toBe(false)
    }
  })

  it('is known on OpenCode only', () => {
    expect(isKnownModel('opencode', 'openai_compatible/llama3')).toBe(true)
    expect(isKnownModel('claude-sdk', 'openai_compatible/llama3')).toBe(false)
  })
})
