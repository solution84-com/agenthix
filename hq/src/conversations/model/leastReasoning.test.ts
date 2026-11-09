import { describe, expect, it } from 'vitest'
import { leastGoogleThinking, leastOpenAIEffort, leastReasoningOptions } from './leastReasoning'
import { anthropicAccess } from './testSupport'

describe("an OpenAI model's least reasoning effort, for a step spoken aloud", () => {
  it('is none from GPT-5.1, minimal for GPT-5, low for the o-series', () => {
    expect(leastOpenAIEffort('gpt-5.1')).toBe('none')
    expect(leastOpenAIEffort('gpt-5.2-mini')).toBe('none')
    expect(leastOpenAIEffort('gpt-5')).toBe('minimal')
    expect(leastOpenAIEffort('gpt-5-mini')).toBe('minimal')
    expect(leastOpenAIEffort('o4-mini')).toBe('low')
    expect(leastOpenAIEffort('o3')).toBe('low')
  })

  it('is nothing for a model that does not reason', () => {
    expect(leastOpenAIEffort('gpt-4o')).toBeNull()
    expect(leastOpenAIEffort('gpt-5-chat-latest')).toBeNull()
    expect(leastOpenAIEffort('gpt-50')).toBeNull()
  })
})

describe("a Gemini model's least thinking, for a step spoken aloud", () => {
  it('is off for 2.5 Flash, the least budget for 2.5 Pro, and the low level from Gemini 3', () => {
    expect(leastGoogleThinking('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 })
    expect(leastGoogleThinking('gemini-2.5-flash-lite')).toEqual({ thinkingBudget: 0 })
    expect(leastGoogleThinking('gemini-2.5-pro')).toEqual({ thinkingBudget: 128 })
    expect(leastGoogleThinking('gemini-3-pro-preview')).toEqual({ thinkingLevel: 'low' })
    expect(leastGoogleThinking('gemini-3.5-flash')).toEqual({ thinkingLevel: 'low' })
  })

  it('is nothing for a model that does not think or is not known', () => {
    expect(leastGoogleThinking('gemini-2.0-flash')).toBeNull()
    expect(leastGoogleThinking('gemini-flash-latest')).toBeNull()
  })
})

describe('the options a step is sent', () => {
  const openai = { ...anthropicAccess, provider: 'openai' as const, model: 'gpt-5.1' }

  it('lower reasoning only on a step spoken aloud', () => {
    expect(leastReasoningOptions({ access: openai, firstSpokenStep: true })).toEqual({ openai: { reasoningEffort: 'none' } })
    expect(leastReasoningOptions({ access: openai, spoken: true })).toEqual({ openai: { reasoningEffort: 'none' } })
    expect(leastReasoningOptions({ access: openai })).toEqual({})
  })

  it('are none for Anthropic and OpenRouter, which set theirs in the body, nor an OpenAI-compatible endpoint', () => {
    for (const provider of ['anthropic', 'openrouter', 'openai_compatible'] as const) {
      expect(leastReasoningOptions({ access: { ...openai, provider }, firstSpokenStep: true })).toEqual({})
    }
  })
})
