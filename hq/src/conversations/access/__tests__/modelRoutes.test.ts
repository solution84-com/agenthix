import { describe, it, expect } from 'vitest'
import {
  catalogueFor, isConversationModel, talkingRoutes, isWithinPolicyOnAnyRoute, makerOf, priceOf, routesOf, sameModelKey, typedModelsNamedBy,
} from '../modelRoutes'

const policy = (over: Partial<{ talking: string; allowed: string[] | null; ceiling: string | null }> = {}) => ({
  talking: 'claude-sonnet-5', lightWork: 'claude-haiku-4-5', heavyWork: 'claude-opus-5', allowed: null, ceiling: null, ...over,
})

describe('which models a key reaches for a conversation @SC-953', () => {
  it("is the bare Claude ids on an Anthropic key, never OpenCode's anthropic/ form", () => {
    const values = catalogueFor('anthropic').map(m => m.value)
    expect(values).toContain('claude-sonnet-5')
    expect(values.some(v => v.startsWith('anthropic/'))).toBe(false)
    expect(isConversationModel('anthropic/claude-sonnet-5')).toBe(false)
    expect(isConversationModel('claude-sonnet-5')).toBe(true)
  })

  it("is the provider's own catalogue on the others, and nothing catalogued on an OpenAI-compatible endpoint", () => {
    expect(catalogueFor('openrouter').every(m => m.value.startsWith('openrouter/'))).toBe(true)
    expect(catalogueFor('openai').every(m => m.value.startsWith('openai/'))).toBe(true)
    expect(catalogueFor('openai_compatible')).toEqual([])
  })

  it('reaches typed models on an endpoint only where the policy names them', () => {
    expect(typedModelsNamedBy({ ...policy(), talking: 'openai_compatible/llama3', allowed: ['openai_compatible/qwen', 'claude-sonnet-5'] }))
      .toEqual(['openai_compatible/llama3', 'openai_compatible/qwen'])
  })
})

describe('the same model on another route @SC-953', () => {
  it('reads Claude direct and through OpenRouter as one model', () => {
    expect(sameModelKey('claude-sonnet-4-5')).toBe(sameModelKey('openrouter/anthropic/claude-sonnet-4.5'))
    expect(sameModelKey('openai/gpt-4.1')).toBe(sameModelKey('openrouter/openai/gpt-4.1'))
    expect(sameModelKey('claude-sonnet-5')).not.toBe(sameModelKey('claude-opus-5'))
  })

  it('lists the named id first, then the other routes', () => {
    const routes = routesOf('claude-sonnet-5').map(r => r.value)
    expect(routes[0]).toBe('claude-sonnet-5')
    expect(routes).toContain('openrouter/anthropic/claude-sonnet-5')
    expect(routes).not.toContain('anthropic/claude-sonnet-5')
  })

  it("reaches OpenCode's anthropic/ form by its routes, though not as it is", () => {
    expect(routesOf('anthropic/claude-sonnet-5').map(r => r.value)).toEqual(['claude-sonnet-5', 'openrouter/anthropic/claude-sonnet-5'])
  })
})

describe('the order a talking model is chosen in @SC-951', () => {
  it("tries the policy's talking model on every route before the next allowed model", () => {
    const routes = talkingRoutes({ ...policy({ allowed: ['claude-sonnet-5', 'openai/gpt-4.1'] }) }).map(r => r.value)
    expect(routes.indexOf('openrouter/anthropic/claude-sonnet-5')).toBeLessThan(routes.indexOf('openai/gpt-4.1'))
    expect(routes[0]).toBe('claude-sonnet-5')
  })
})

describe('within the policy on any route @SC-951', () => {
  it('allows the same model through another route when the allow-list names it', () => {
    const p = policy({ allowed: ['claude-sonnet-5'] })
    expect(isWithinPolicyOnAnyRoute('openrouter/anthropic/claude-sonnet-5', p)).toBe(true)
    expect(isWithinPolicyOnAnyRoute('openrouter/anthropic/claude-opus-5', p)).toBe(false)
  })

  it('keeps to the ceiling', () => {
    const p = policy({ ceiling: 'claude-sonnet-5' })
    expect(isWithinPolicyOnAnyRoute('claude-haiku-4-5', p)).toBe(true)
    expect(isWithinPolicyOnAnyRoute('claude-opus-5', p)).toBe(false)
  })
})

describe('how a model is shown @SC-953', () => {
  it('names who makes it from its id', () => {
    expect(makerOf('claude-sonnet-5')).toBe('Anthropic')
    expect(makerOf('openrouter/anthropic/claude-sonnet-5')).toBe('Anthropic')
    expect(makerOf('openrouter/deepseek/deepseek-v3.2')).toBe('DeepSeek')
    expect(makerOf('openai/gpt-4.1')).toBe('OpenAI')
    expect(makerOf('openrouter/~openai/gpt-latest')).toBe('OpenAI')
    expect(makerOf('openrouter/sakana/some-model')).toBe('Sakana')
  })

  it('gives a price hint from one to three', () => {
    expect(priceOf(null)).toBe(1)
    expect(priceOf(0)).toBe(1)
    expect(priceOf(128)).toBe(1)
    expect(priceOf(137)).toBe(2)
    expect(priceOf(148)).toBe(3)
  })
})
