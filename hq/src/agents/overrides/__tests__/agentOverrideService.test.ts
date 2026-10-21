import { describe, it, expect } from 'vitest'

import {
  modelForRun, modelOverrideRefusal, validateOverride, overrideFromRow, narrowsAnything, OverrideValidationError,
} from '../agentOverrideService'

// Reads and writes of the stored override, and the boundary a run acts in, are
// agentOverrideService.integration.test.ts's subject; the strictest-level rules are
// permissions/__tests__/effectivePermissions.test.ts's.

describe('override narrowing @SC-615', () => {
  const opus = { defaultModel: 'claude-opus-4-6', runtime: 'claude-sdk' }

  it('a model override applies only when it is an offered model', () => {
    expect(modelForRun(opus, 'claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(modelForRun(opus, 'gpt-9')).toBe('claude-opus-4-6')
  })

  it('a boundary\'s model override wins over a session\'s chosen model, which wins over the package\'s (ruling T15)', () => {
    expect(modelForRun(opus, 'claude-haiku-4-5', 'claude-sonnet-4-6')).toBe('claude-haiku-4-5')
    expect(modelForRun(opus, null, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(modelForRun(opus, 'gpt-9', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(modelForRun(opus, null, null)).toBe('claude-opus-4-6')
  })

  it('ignores a model override that costs more than the agent\'s model — a later settings edit can choose a cheaper one', () => {
    const haiku = { defaultModel: 'claude-haiku-4-5', runtime: 'claude-sdk' }
    expect(modelForRun(haiku, 'claude-opus-4-6')).toBe('claude-haiku-4-5')
    expect(modelForRun(haiku, 'claude-sonnet-4-6', 'claude-haiku-4-5')).toBe('claude-haiku-4-5')
    const sonnet = { defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' }
    expect(modelForRun(sonnet, 'claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
  })

  it('ignores a model override on an agent whose runtime offers no such model', () => {
    expect(modelForRun({ defaultModel: 'anthropic/claude-opus-4-8', runtime: 'opencode' }, 'claude-haiku-4-5')).toBe('anthropic/claude-opus-4-8')
    expect(modelForRun({ defaultModel: 'claude-opus-4-6', runtime: 'legacy' }, 'claude-haiku-4-5')).toBe('claude-opus-4-6')
  })

  it('applies an equal or cheaper model override on OpenCode, and ignores a dearer one', () => {
    const opencode = { defaultModel: 'anthropic/claude-opus-4-8', runtime: 'opencode' }
    expect(modelForRun(opencode, 'anthropic/claude-haiku-4-5')).toBe('anthropic/claude-haiku-4-5')
    expect(modelForRun(opencode, 'openrouter/openrouter/free')).toBe('openrouter/openrouter/free')
    expect(modelForRun(opencode, 'anthropic/claude-opus-4-7')).toBe('anthropic/claude-opus-4-7')
    const cheap = { defaultModel: 'anthropic/claude-haiku-4-5', runtime: 'opencode' }
    expect(modelForRun(cheap, 'anthropic/claude-opus-4-8')).toBe('anthropic/claude-haiku-4-5')
  })

  it('takes a typed model on an OpenAI-compatible endpoint as an override of a dearer model', () => {
    const opencode = { defaultModel: 'anthropic/claude-opus-4-8', runtime: 'opencode' }
    expect(modelOverrideRefusal(opencode, 'openai_compatible/llama3.1:8b')).toBeNull()
    expect(modelOverrideRefusal({ defaultModel: 'openai_compatible/llama3.1:8b', runtime: 'opencode' }, 'anthropic/claude-haiku-4-5')).toMatch(/same as or less/)
    expect(modelOverrideRefusal(opencode, 'openai_compatible/')).toMatch(/not a model/)
  })

  const none = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

  it('validates a narrowing: a model, an approval, and a state per tool and per bash pattern', () => {
    const narrowing = {
      model: 'claude-sonnet-4-6', approval: 'immediate',
      allowedTools: [{ name: 'bash', state: 'never' }], allowedBashPatterns: [{ pattern: 'git push', state: 'ask' }],
    }
    expect(validateOverride(narrowing)).toEqual(narrowing)
    expect(() => validateOverride({ ...none, model: 5 })).toThrow(OverrideValidationError)
    expect(() => validateOverride({ ...none, approval: 'strict' })).toThrow(/approval/)
    expect(() => validateOverride({ ...none, allowedTools: ['bash'] })).toThrow(/name/)
    expect(() => validateOverride({ ...none, allowedBashPatterns: [{ pattern: 'ls', state: 'maybe' }] })).toThrow(/Always, Ask or Never/)
  })

  it('trims names, keeps a repeated one\'s last state, and treats an empty list as none', () => {
    expect(validateOverride({ ...none, allowedTools: [{ name: ' bash ', state: 'ask' }, { name: 'bash', state: 'never' }] }).allowedTools)
      .toEqual([{ name: 'bash', state: 'never' }])
    expect(validateOverride({ ...none, allowedTools: [], allowedBashPatterns: [] })).toEqual(none)
  })

  it('reads a stored row back, a malformed list as none', () => {
    expect(overrideFromRow({ model: null, approval: 'unrestricted', allowedTools: 'junk', allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] }))
      .toEqual({ ...none, allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })
  })

  it('says whether a narrowing sets anything', () => {
    expect(narrowsAnything(null)).toBe(false)
    expect(narrowsAnything(none)).toBe(false)
    expect(narrowsAnything({ ...none, allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })).toBe(true)
  })
})
