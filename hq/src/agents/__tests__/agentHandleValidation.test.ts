import { describe, it, expect } from 'vitest'
import { isValidAgentHandle } from '../agentHandle'
import { generateHandle } from '../agentService'

// The handle's own rules. Where every way of creating, renaming and deleting an agent applies them is
// agentHandleSafety.integration.test.ts's subject.
const BAD_HANDLES = ['../../escape', '..', '.', '', 'a/b', 'a\\b', 'Scout', 'has space', '-lead', '_lead', 'x'.repeat(65)]

describe('isValidAgentHandle', () => {
  it.each(['kernel', 'scout-x', 'wasp_dev', 'qa', 'a', 'agent-9', 'x'.repeat(64)])('accepts %j', (handle) => {
    expect(isValidAgentHandle(handle)).toBe(true)
  })

  it.each(BAD_HANDLES)('refuses %j', (handle) => {
    expect(isValidAgentHandle(handle)).toBe(false)
  })

  it('generateHandle only ever produces a valid handle', () => {
    for (const name of ['Research Bot', 'x'.repeat(200), `${'a'.repeat(58)} b`, '---', '日本語', 'Ünïcödé Agent']) {
      expect(isValidAgentHandle(generateHandle(name))).toBe(true)
    }
  })
})
