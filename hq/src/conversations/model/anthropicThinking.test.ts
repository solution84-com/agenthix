import { describe, expect, it } from 'vitest'
import { leastThinkingFor } from './anthropicThinking'

describe("an Anthropic model's least thinking, for a spoken message's first step", () => {
  it('is off for Haiku and for a Sonnet before 5.5, which can turn it off', () => {
    expect(leastThinkingFor('claude-haiku-5-5')).toBe('disabled')
    expect(leastThinkingFor('claude-haiku-4-5-20251001')).toBe('disabled')
    expect(leastThinkingFor('claude-sonnet-5')).toBe('disabled')
    expect(leastThinkingFor('claude-sonnet-5-20260101')).toBe('disabled')
    expect(leastThinkingFor('claude-sonnet-4-5-20250929')).toBe('disabled')
  })

  it('is between tools only for Sonnet 5.5 and later, which cannot turn it off', () => {
    expect(leastThinkingFor('claude-sonnet-5-5')).toBe('between_tools')
    expect(leastThinkingFor('claude-sonnet-6')).toBe('between_tools')
  })

  it('is left to the model it does not cover', () => {
    expect(leastThinkingFor('claude-opus-5-5')).toBeNull()
    expect(leastThinkingFor('claude-fable-5-1')).toBeNull()
  })
})
