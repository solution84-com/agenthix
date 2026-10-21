import { describe, it, expect } from 'vitest'
import { generateCredential, hashCredential, credentialMatches } from '../credentials'

describe('machine credential issuance @SC-284', () => {
  it('generates a prefixed, high-entropy value with a displayable prefix', () => {
    const { value, prefix } = generateCredential('smc')
    expect(value.startsWith('smc_')).toBe(true)
    expect(value.length).toBeGreaterThanOrEqual(40)
    expect(prefix).toBe(value.slice(0, 16))
  })

  it('never generates the same value twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCredential('smc').value))
    expect(seen.size).toBe(200)
  })

  it('stores a hash, not the value', () => {
    const { value } = generateCredential('smc')
    const hash = hashCredential(value)
    expect(hash).not.toContain(value)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('machine credential verification @SC-286', () => {
  it('accepts the issued value against its own hash', () => {
    const { value } = generateCredential('smc')
    expect(credentialMatches(value, hashCredential(value))).toBe(true)
  })

  it('rejects a different value', () => {
    const { value } = generateCredential('smc')
    expect(credentialMatches(value, hashCredential(generateCredential('smc').value))).toBe(false)
  })

  it('rejects without throwing when the stored hash is malformed', () => {
    expect(credentialMatches('smc_whatever', 'not-a-hash')).toBe(false)
  })

  it('rejects a site that has no credential at all', () => {
    expect(credentialMatches('smc_anything', null)).toBe(false)
  })

  it('rejects an empty stored hash', () => {
    expect(credentialMatches('smc_anything', '')).toBe(false)
  })

  it('rejects a valid digest with trailing garbage appended', () => {
    const { value } = generateCredential('smc')
    // Buffer.from(...,'hex') stops at the first invalid character, so this
    // decodes to the same 32 bytes as the real digest and would otherwise pass.
    expect(credentialMatches(value, `${hashCredential(value)}zz`)).toBe(false)
  })

  it('rejects a digest of the wrong length', () => {
    const { value } = generateCredential('smc')
    expect(credentialMatches(value, hashCredential(value).slice(0, 62))).toBe(false)
  })
})
