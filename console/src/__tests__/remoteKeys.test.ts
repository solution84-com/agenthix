import { createPrivateKey, createPublicKey, verify, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { allowList } from '../net/allowList'
import { certificateRequest, makeRemoteKey } from '../net/csr'
import { base32Decode, hotp, totpStep } from '../auth/totp'
import { certificateFor, fromPem, readDer } from './remoteHelpers'

describe('the key remote access ends TLS with, and its certificate request @SC-1071', () => {
  it('is a P-256 key, and the request is signed by it and names the one DNS name', () => {
    const key = makeRemoteKey()
    expect(createPrivateKey(key).asymmetricKeyDetails).toMatchObject({ namedCurve: 'prime256v1' })
    const csr = certificateRequest(key, 'fc-1.console.example')
    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/)
    const [request] = readDer(fromPem(csr))
    const [info, algorithm, signature] = readDer(request!.content)
    expect(algorithm!.content.toString('hex')).toBe('06082a8648ce3d040302')
    expect(verify('sha256', info!.whole, { key: createPublicKey(createPrivateKey(key)), dsaEncoding: 'der' }, signature!.content.subarray(1))).toBe(true)
    const [version, subject, spki, attributes] = readDer(info!.content)
    expect(version!.content).toEqual(Buffer.from([0]))
    expect(subject!.content.toString('latin1')).toContain('fc-1.console.example')
    expect(spki!.whole).toEqual(createPublicKey(createPrivateKey(key)).export({ type: 'spki', format: 'der' }))
    // [0] { extensionRequest { subjectAltName: dNSName } }
    expect(attributes!.tag).toBe(0xa0)
    expect(attributes!.content.toString('latin1')).toContain('\x82\x14fc-1.console.example')
    expect(attributes!.content.toString('hex')).toContain('0603551d11')
  })

  it('a certificate made for it is one Node reads as for that key and that name', () => {
    const key = makeRemoteKey()
    const cert = new X509Certificate(certificateFor(key, 'fc-1.console.example'))
    expect(cert.checkPrivateKey(createPrivateKey(key))).toBe(true)
    expect(cert.checkHost('fc-1.console.example')).toBe('fc-1.console.example')
    expect(cert.checkPrivateKey(createPrivateKey(makeRemoteKey()))).toBe(false)
  })
})

describe('the allow list @SC-1071', () => {
  const list = allowList(['203.0.113.7/32', '2001:db8:1:2::/64'])

  it('answers the addresses it holds, an IPv4 one also when it arrives mapped into IPv6', () => {
    expect(list.allows('203.0.113.7')).toBe(true)
    expect(list.allows('::ffff:203.0.113.7')).toBe(true)
    expect(list.allows('2001:db8:1:2:ffff::9')).toBe(true)
  })

  it('answers nobody else', () => {
    for (const a of ['203.0.113.8', '127.0.0.1', '::1', '2001:db8:1:3::1', '::ffff:203.0.113.8', '', undefined, 'not an address']) {
      expect(list.allows(a)).toBe(false)
    }
  })

  it('will not be made from anything wider', () => {
    expect(() => allowList(['0.0.0.0/0'])).toThrow()
    expect(() => allowList(['203.0.113.0/24'])).toThrow()
  })
})

describe('authenticator codes (RFC 6238) @SC-1071', () => {
  // RFC 6238, appendix B: the SHA-1 secret is the ASCII "12345678901234567890"; codes are the low 6 digits.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('match the RFC\'s test values', () => {
    expect(base32Decode(secret).toString('ascii')).toBe('12345678901234567890')
    expect(hotp(base32Decode(secret), Math.floor(59 / 30))).toBe('287082')
    expect(hotp(base32Decode(secret), Math.floor(1111111109 / 30))).toBe('081804')
    expect(hotp(base32Decode(secret), Math.floor(1234567890 / 30))).toBe('005924')
  })

  it('take a code from this step or one either side, and nothing further off', () => {
    const at = 1234567890_000
    expect(totpStep(secret, '005924', at)).toBe(41152263)
    expect(totpStep(secret, '005924', at + 30_000)).toBe(41152263)
    expect(totpStep(secret, '005924', at + 90_000)).toBeNull()
    expect(totpStep(secret, '12345', at)).toBeNull()
  })
})
