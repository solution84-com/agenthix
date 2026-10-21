import { describe, expect, it } from 'vitest'
import { fromBase64url, fromHex, randomBytes, toBase64url, toHex } from '../crypto/webCrypto.js'
import { formatFingerprint, parseHostEnvelope } from '../envelope.js'

describe('encodings', () => {
  it('round-trip base64url for every length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = randomBytes(n)
      const text = toBase64url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64url(text)).toEqual(bytes)
    }
  })

  it('read only canonical base64url, so one value has one spelling', () => {
    expect(toBase64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(fromBase64url('-_9')).toBeNull()
    expect(fromBase64url('AAA=')).toBeNull()
    expect(fromBase64url('A')).toBeNull()
    expect(fromBase64url('a+b/')).toBeNull()
  })

  it('round-trip hex, and refuse half bytes', () => {
    expect(toHex(fromHex('00ff10')!)).toBe('00ff10')
    expect(fromHex('abc')).toBeNull()
    expect(fromHex('zz')).toBeNull()
  })

  it('refuse to format what is not a fingerprint, and envelopes with odd fields', () => {
    expect(() => formatFingerprint('5F2A')).toThrow()
    expect(parseHostEnvelope({ v: 1, from: 'a'.repeat(64), to: 'b'.repeat(64), id: 'x', sentAt: 1.5, expiresAt: 2, epk: 'x', iv: 'x', ct: 'x', sig: 'x' })).toBeNull()
  })
})
