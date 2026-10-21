import { describe, it, expect } from 'vitest'
import {
  OPENCODE_MODELS, CLAUDE_SDK_MODELS, modelsForRuntime, isKnownModel, modelCostRank, isEqualOrCheaperModel,
  providerOfModel, isTypedModel, typedModelValue,
} from '../models/index.js'

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
      expect(modelCostRank('opencode', value)).toBe(0)
    }
    expect(OPENCODE_MODELS.filter(m => m.value.endsWith(':free')).length).toBeGreaterThan(5)
  })

  it('ranks by price: a mini model below its flagship, Haiku below Opus', () => {
    const rank = (v: string) => modelCostRank('opencode', v) as number
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

  it('names the provider whose credential a model needs', () => {
    expect(providerOfModel('claude-sdk', 'claude-sonnet-4-6')).toBe('anthropic')
    expect(providerOfModel('opencode', 'openrouter/openrouter/free')).toBe('openrouter')
    expect(providerOfModel('opencode', 'openai/gpt-5-nano')).toBe('openai')
    expect(providerOfModel('opencode', 'openai_compatible/llama3')).toBe('openai_compatible')
    expect(providerOfModel('opencode', 'mystery/model')).toBeNull()
    expect(providerOfModel('opencode', 'bare')).toBeNull()
  })
})

describe('equal or cheaper on OpenCode', () => {
  it('admits a model of the same or a lower price and refuses a dearer one', () => {
    expect(isEqualOrCheaperModel('opencode', 'anthropic/claude-haiku-4-5', 'anthropic/claude-opus-4-8')).toBe(true)
    expect(isEqualOrCheaperModel('opencode', 'anthropic/claude-opus-4-7', 'anthropic/claude-opus-4-8')).toBe(true)
    expect(isEqualOrCheaperModel('opencode', 'anthropic/claude-opus-4-8', 'anthropic/claude-haiku-4-5')).toBe(false)
  })

  it('admits a free model against any current model, and only free ones against a free current', () => {
    expect(isEqualOrCheaperModel('opencode', 'openrouter/openrouter/free', 'anthropic/claude-opus-4-8')).toBe(true)
    expect(isEqualOrCheaperModel('opencode', 'openai/gpt-5-nano', 'openrouter/openrouter/free')).toBe(false)
  })

  it('refuses an unknown model, and admits nothing against an unknown current', () => {
    expect(isEqualOrCheaperModel('opencode', 'openrouter/nope', 'anthropic/claude-opus-4-8')).toBe(false)
    expect(isEqualOrCheaperModel('opencode', 'openrouter/openrouter/free', 'openrouter/nope')).toBe(false)
  })

  it('keeps the Claude runtime ranking by tier', () => {
    expect(isEqualOrCheaperModel('claude-sdk', 'claude-haiku-4-5', 'claude-opus-4-6')).toBe(true)
    expect(isEqualOrCheaperModel('claude-sdk', 'claude-opus-4-6', 'claude-sonnet-4-6')).toBe(false)
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

  it('is known and ranked with the free models on OpenCode only', () => {
    expect(isKnownModel('opencode', 'openai_compatible/llama3')).toBe(true)
    expect(modelCostRank('opencode', 'openai_compatible/llama3')).toBe(0)
    expect(isKnownModel('claude-sdk', 'openai_compatible/llama3')).toBe(false)
  })

  it('is an allowed override of a dearer model, but not the other way round', () => {
    expect(isEqualOrCheaperModel('opencode', 'openai_compatible/llama3', 'anthropic/claude-opus-4-8')).toBe(true)
    expect(isEqualOrCheaperModel('opencode', 'anthropic/claude-haiku-4-5', 'openai_compatible/llama3')).toBe(false)
  })
})
