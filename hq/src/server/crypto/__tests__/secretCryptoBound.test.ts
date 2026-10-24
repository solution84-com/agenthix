import { describe, it, expect, beforeAll } from 'vitest'
import { encryptBytesBound, decryptBytesBound } from '../secretCrypto'

describe('secretCrypto, bound to associated data', () => {
  beforeAll(() => {
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')
  })

  it('round-trips bytes that are not text', () => {
    const plain = Buffer.from([0, 255, 1, 254, 10, 13, 0])
    expect(decryptBytesBound(encryptBytesBound(plain, 'a'), 'a').equals(plain)).toBe(true)
  })

  it('keeps no plain bytes in what it stores', () => {
    const plain = Buffer.from('CANARY-not-a-real-secret-7f3a', 'utf8')
    expect(encryptBytesBound(plain, 'a').includes(plain)).toBe(false)
  })

  it('refuses to decrypt under other associated data', () => {
    const stored = encryptBytesBound(Buffer.from('CANARY'), 'secret-1|project|p1')
    expect(() => decryptBytesBound(stored, 'secret-2|project|p1')).toThrow()
    expect(() => decryptBytesBound(stored, 'secret-1|project|p2')).toThrow()
  })

  it('refuses a changed byte', () => {
    const stored = encryptBytesBound(Buffer.from('CANARY'), 'a')
    stored[stored.length - 1] ^= 1
    expect(() => decryptBytesBound(stored, 'a')).toThrow()
  })

  it('refuses a value too short to be one, or of a format it does not know', () => {
    expect(() => decryptBytesBound(Buffer.alloc(10), 'a')).toThrow(/Malformed/)
    const stored = encryptBytesBound(Buffer.from('x'), 'a')
    stored[0] = 9
    expect(() => decryptBytesBound(stored, 'a')).toThrow(/Malformed/)
  })
})
