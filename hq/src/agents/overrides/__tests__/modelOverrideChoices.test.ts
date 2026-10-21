import { describe, it, expect } from 'vitest'
import { modelOverrideChoices } from '../modelOverrideChoices'
import { modelOverrideRefusal } from '../agentOverrideService'


const byValue = (choices: ReturnType<typeof modelOverrideChoices>) =>
  Object.fromEntries(choices.map(c => [c.value, c.disabledReason]))

describe('modelOverrideChoices @SC-615', () => {
  it('disables every model that costs more than the agent’s own, and only those', () => {
    const r = byValue(modelOverrideChoices({ runtime: 'claude-sdk', defaultModel: 'claude-sonnet-4-6' }))
    expect(r['claude-haiku-4-5']).toBeNull()
    expect(r['claude-sonnet-4-6']).toBeNull()
    expect(r['claude-sonnet-4-5']).toBeNull()
    expect(r['claude-opus-4-6']).toMatch(/costs more/i)
  })

  it('offers only the cheapest tier for the cheapest agent', () => {
    const r = byValue(modelOverrideChoices({ runtime: 'claude-sdk', defaultModel: 'claude-haiku-4-5' }))
    expect(r['claude-haiku-4-5']).toBeNull()
    expect(r['claude-sonnet-4-6']).toMatch(/costs more/i)
    expect(r['claude-opus-4-6']).toMatch(/costs more/i)
  })

  it('disables all of them when the agent’s model is not one that can be ranked', () => {
    const r = byValue(modelOverrideChoices({ runtime: 'claude-sdk', defaultModel: 'some-other-model' }))
    expect(Object.values(r).every(v => typeof v === 'string')).toBe(true)
  })

  it('offers an agent on OpenCode the catalogue, grouped by provider, with the dearer models disabled', () => {
    const choices = modelOverrideChoices({ runtime: 'opencode', defaultModel: 'anthropic/claude-haiku-4-5' })
    const r = byValue(choices)
    expect(r['anthropic/claude-haiku-4-5']).toBeNull()
    expect(r['openrouter/openrouter/free']).toBeNull()
    expect(r['anthropic/claude-opus-4-8']).toMatch(/costs more/i)
    expect(r['claude-haiku-4-5']).toBeUndefined()
    expect(choices.find(c => c.value === 'openai/gpt-5-nano')?.group).toBe('OpenAI')
  })

  it('offers nothing on a runtime it does not know', () => {
    expect(modelOverrideChoices({ runtime: 'legacy', defaultModel: 'claude-sonnet-4-6' })).toEqual([])
  })

  it('agrees with what the server refuses on save, for every model', () => {
    for (const agent of [
      { runtime: 'claude-sdk', defaultModel: 'claude-opus-4-6' },
      { runtime: 'claude-sdk', defaultModel: 'claude-sonnet-4-6' },
      { runtime: 'claude-sdk', defaultModel: 'claude-haiku-4-5' },
      { runtime: 'opencode', defaultModel: 'anthropic/claude-sonnet-4-6' },
      { runtime: 'opencode', defaultModel: 'openai_compatible/llama3' },
    ]) {
      for (const c of modelOverrideChoices(agent)) {
        expect(c.disabledReason === null).toBe(modelOverrideRefusal(agent, c.value) === null)
      }
    }
  })
})
