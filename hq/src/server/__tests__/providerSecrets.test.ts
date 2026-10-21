import { describe, it, expect, vi } from 'vitest'

// Provider keys' pure helpers: masking and decrypting a stored value. Storing and
// reading keys, and the boot pass that discards keys stored in the clear, are
// providerSecrets.integration.test.ts.

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import { maskProviderKey, looksEncrypted, decryptProviderKey } from '../providerService'
import { encryptSecret } from '../crypto/secretCrypto'

describe('providerService — a stored value', () => {
  it('masks a key for display rather than returning it', () => {
    expect(maskProviderKey(encryptSecret('sk-abcd1234'))).toBe('••••1234')
  })

  // A value that *looks* encrypted but cannot be decrypted (wrong
  // SECRETS_MASTER_KEY, a corrupted row, a coincidental shape) must fail
  // closed — never hand back the ciphertext as though it worked.
  it('throws rather than silently returning ciphertext when a value that looks encrypted cannot be decrypted', () => {
    const notReallyEncrypted = 'aGVsbG8=.d29ybGQ=.Zm9vYmFy'
    expect(looksEncrypted(notReallyEncrypted)).toBe(true)
    expect(() => decryptProviderKey(notReallyEncrypted)).toThrow()
  })

  it('never hands back a value stored in the clear', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decryptProviderKey('sk-plain')).toBe('')
    expect(maskProviderKey('sk-plain')).not.toContain('lain')
  })
})
