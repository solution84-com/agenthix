import { describe, it, expect } from 'vitest'

import {
  validateOverride, overrideFromRow, narrowsAnything,
} from '../agentOverrideService'

// Reads and writes of the stored override, and the boundary a run acts in, are
// agentOverrideService.integration.test.ts's subject; the strictest-level rules are
// permissions/__tests__/effectivePermissions.test.ts's.

describe('override narrowing @SC-615', () => {
  const none = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

  it('validates a narrowing: an approval, and a state per tool and per bash pattern; a model is no longer one', () => {
    const narrowing = {
      model: null, approval: 'immediate',
      allowedTools: [{ name: 'bash', state: 'never' }], allowedBashPatterns: [{ pattern: 'git push', state: 'ask' }],
    }
    expect(validateOverride(narrowing)).toEqual(narrowing)
    expect(validateOverride({ ...narrowing, model: 'claude-sonnet-4-6' })).toEqual(narrowing)
    expect(narrowsAnything(validateOverride({ ...none, model: 'claude-sonnet-4-6' }))).toBe(false)
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
    expect(overrideFromRow({ approval: 'unrestricted', allowedTools: 'junk', allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] }))
      .toEqual({ ...none, allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })
  })

  it('says whether a narrowing sets anything', () => {
    expect(narrowsAnything(null)).toBe(false)
    expect(narrowsAnything(none)).toBe(false)
    expect(narrowsAnything({ ...none, allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })).toBe(true)
  })
})
