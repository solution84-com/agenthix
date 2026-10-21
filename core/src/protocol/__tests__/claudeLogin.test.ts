import { describe, it, expect } from 'vitest'
import { CLAUDE_LOGIN_METHODS } from '../claudeLogin.js'
import * as protocol from '../index.js'

describe('the Claude sign-in contract', () => {
  it('names three distinct methods', () => {
    const names = Object.values(CLAUDE_LOGIN_METHODS)
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    for (const name of names) expect(typeof name).toBe('string')
  })

  it('is exported from the protocol index', () => {
    expect(protocol.CLAUDE_LOGIN_METHODS).toBe(CLAUDE_LOGIN_METHODS)
  })
})
