import { describe, it, expect, beforeAll, vi } from 'vitest'
import { encryptSecret, decryptSecret, decryptStoredSecret, looksEncrypted } from '../secretCrypto'

describe('secretCrypto @SC-260', () => {
  beforeAll(() => {
    // 32-byte key, base64 — deterministic for the test
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')
  })

  it('round-trips a value', () => {
    const plain = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
    const ct = encryptSecret(plain)
    expect(ct).not.toContain('BEGIN PRIVATE KEY') // ciphertext is opaque
    expect(decryptSecret(ct)).toBe(plain)
  })

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })

  it('refuses a stored value whose authentication tag was cut short', () => {
    const [iv, tag, ct] = encryptSecret('x').split('.')
    const shortened = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64')
    expect(() => decryptSecret(`${iv}.${shortened}.${ct}`)).toThrow()
  })
})

describe('decryptStoredSecret — a value stored in the clear', () => {
  it('round-trips an encrypted value', () => {
    const stored = encryptSecret('sk-live')
    expect(looksEncrypted(stored)).toBe(true)
    expect(decryptStoredSecret(stored, 'test key')).toBe('sk-live')
  })

  it('reads a value in the clear as absent, logging once without the value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decryptStoredSecret('sk-live', 'legacy test key')).toBeNull()
    expect(decryptStoredSecret('sk-other', 'legacy test key')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).not.toContain('sk-live')
    warn.mockRestore()
  })

  it('still refuses a value that looks encrypted but will not decrypt', () => {
    expect(() => decryptStoredSecret('aGVsbG8=.d29ybGQ=.Zm9vYmFy', 'test key')).toThrow()
  })
})
