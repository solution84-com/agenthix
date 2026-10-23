import { describe, expect, it } from 'vitest'
import { PROVIDER_STATE_DETAIL_MAX } from '@agenthix/core'
import { keyHintOf, providerKeyProblem, vendorMessage } from '../secrecy'

describe('keyHintOf @SC-1171', () => {
  it('keeps only the last four characters', () => {
    expect(keyHintOf('sk-test-fake-0000a3f9')).toBe('a3f9')
  })

  it('is null for no key', () => {
    expect(keyHintOf(null)).toBeNull()
    expect(keyHintOf('')).toBeNull()
  })
})

describe('providerKeyProblem @SC-1171', () => {
  it('refuses a key too short to be one, or with spaces or control characters inside', () => {
    expect(providerKeyProblem('abc')).toMatch(/too short/)
    expect(providerKeyProblem('sk-test fake-123456')).toMatch(/space/)
    expect(providerKeyProblem('sk-test-fake-1234\n56')).toMatch(/space/)
  })

  it('accepts an ordinary key', () => {
    expect(providerKeyProblem('sk-test-fake-0123456789')).toBeNull()
  })
})

describe('vendorMessage @SC-1171', () => {
  it('removes the key itself, and anything else that looks like a key', () => {
    const key = 'sk-test-fake-0123456789abcdef'
    const said = vendorMessage(`invalid x-api-key ${key}; also saw Bearer abcdefghijklmnopqrstuvwxyz012345`, key)
    expect(said).not.toContain(key)
    expect(said).not.toContain('abcdefghijklmnopqrstuvwxyz012345')
    expect(said).toContain('invalid x-api-key')
  })

  it('removes a key quoted partly, by its long runs', () => {
    expect(vendorMessage('Incorrect API key provided: sk-proj-AbCdEfGhIjKlMnOpQrStUv. You can find…')).not.toContain('AbCdEfGhIjKlMnOpQrStUv')
  })

  it('trims to the most a state keeps, on one line', () => {
    const said = vendorMessage(`  first\n\nsecond ${'x '.repeat(400)}  `)
    expect(said.length).toBeLessThanOrEqual(PROVIDER_STATE_DETAIL_MAX)
    expect(said.startsWith('first second')).toBe(true)
    expect(said).not.toContain('\n')
  })
})
