import { describe, it, expect } from 'vitest'
import { contextWindowOf, DEFAULT_CONTEXT_WINDOW } from '../windows'

describe('contextWindowOf @SC-979', () => {
  it('knows a model by its own name, whichever provider routes it, and gives an unknown one a small window', () => {
    expect(contextWindowOf('claude-sonnet-5')).toBe(200_000)
    expect(contextWindowOf('openrouter/anthropic/claude-sonnet-5')).toBe(200_000)
    expect(contextWindowOf('openrouter/google/gemini-2.5-pro')).toBe(1_000_000)
    expect(contextWindowOf('openai/gpt-5')).toBe(400_000)
    expect(contextWindowOf('openai_compatible/llama3')).toBe(DEFAULT_CONTEXT_WINDOW)
  })
})
