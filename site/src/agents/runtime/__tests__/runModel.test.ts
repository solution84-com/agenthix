import { describe, expect, it } from 'vitest'
import { runModel } from '../runModel'

describe("a run's model @SC-955 @SC-1014", () => {
  it('is the model hq dispatched the run with, over a session model written when the session was made', () => {
    expect(runModel('opencode', 'openrouter/a', 'openai/b', 'claude-sonnet-4-6')).toBe('openai/b')
  })

  it("is the session's model when the run came with none", () => {
    expect(runModel('opencode', 'openrouter/a', null, 'claude-sonnet-4-6')).toBe('openrouter/a')
  })

  it("is the agent's when neither says, without the Claude SDK's date suffix", () => {
    expect(runModel('claude-sdk', null, null, 'claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5')
  })
})
