import { describe, expect, it } from 'vitest'
import type { LeadMessage } from '../contract'
import { breakpointPositions, cacheStyleOf } from './caching'

const user = (content: string): LeadMessage => ({ role: 'user', content })

describe('breakpointPositions @SC-956', () => {
  it('counts the non-empty system parts first, then the messages', () => {
    expect(breakpointPositions({
      system: [{ text: '' }, { text: 'instructions', cacheAfter: true }, { text: 'block', cacheAfter: true }],
      messages: [user('a'), user('b'), user('c')],
      cacheAfterMessage: 1,
    })).toEqual([0, 1, 3, 4])
  })

  it('puts one breakpoint where the turn starts and the end meet', () => {
    expect(breakpointPositions({ system: [{ text: 's', cacheAfter: true }], messages: [user('a')], cacheAfterMessage: 0 })).toEqual([0, 1])
  })

  it('ignores a cacheAfterMessage outside the messages', () => {
    expect(breakpointPositions({ system: [{ text: 's' }], messages: [user('a')], cacheAfterMessage: 4 })).toEqual([1])
  })

  it('keeps the latest four', () => {
    const system = ['a', 'b', 'c', 'd'].map((text) => ({ text, cacheAfter: true }))
    expect(breakpointPositions({ system, messages: [user('x')] })).toEqual([1, 2, 3, 4])
  })
})

describe('cacheStyleOf @SC-956', () => {
  it.each([
    ['anthropic', 'claude-x', { breakpoints: true, key: null }],
    ['openai', 'openai/gpt-x', { breakpoints: false, key: 'prompt_cache_key' }],
    ['openrouter', 'openrouter/anthropic/claude-x', { breakpoints: true, key: 'session_id' }],
    ['openrouter', 'anthropic/claude-x', { breakpoints: true, key: 'session_id' }],
    ['openrouter', 'openrouter/google/gemini-x', { breakpoints: false, key: 'session_id' }],
    ['google', 'google/gemini-x', { breakpoints: false, key: null }],
    ['openai_compatible', 'm', { breakpoints: false, key: null }],
  ] as const)('%s %s', (provider, model, expected) => {
    expect(cacheStyleOf({ provider, model })).toEqual(expected)
  })
})
