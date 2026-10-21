import { describe, expect, it } from 'vitest'
import {
  cloudAssertionClientId, cloudClientIdOf, generateCloudConnectionKeys, signCloudClientAssertion, verifyCloudClientAssertion,
} from '../crypto/index.js'
import { isCloudClientId, isCloudPublicKey } from '../connection.js'
import { fromBase64url, fromUtf8, toBase64url, utf8 } from '../../host/crypto/webCrypto.js'

const AUD = 'https://cloud.example.com/connect/token'
const T0 = Date.UTC(2026, 0, 1)

function claimsOf(assertion: string): Record<string, unknown> {
  return JSON.parse(fromUtf8(fromBase64url(assertion.split('.')[1])!))
}

function withClaims(assertion: string, over: object): string {
  const [h, , s] = assertion.split('.')
  return [h, toBase64url(utf8(JSON.stringify({ ...claimsOf(assertion), ...over }))), s].join('.')
}

describe("hq's key and client id @SC-1082", () => {
  it('a new key is a 32-byte Ed25519 key, and its client id is the RFC 7638 thumbprint', async () => {
    const keys = await generateCloudConnectionKeys()
    expect(isCloudPublicKey(keys.publicKey)).toBe(true)
    const id = await cloudClientIdOf(keys.publicKey)
    expect(isCloudClientId(id)).toBe(true)
    expect(await cloudClientIdOf(keys.publicKey)).toBe(id)
    expect(await cloudClientIdOf((await generateCloudConnectionKeys()).publicKey)).not.toBe(id)
  })

  it('matches RFC 8037 appendix A.3\'s thumbprint', async () => {
    expect(await cloudClientIdOf('11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo')).toBe('kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k')
  })
})

describe('client assertions @SC-1082', () => {
  it('hq signs one for an endpoint and Cloud verifies it with the registered key', async () => {
    const keys = await generateCloudConnectionKeys()
    const assertion = await signCloudClientAssertion(keys, AUD, T0)
    const id = await cloudClientIdOf(keys.publicKey)
    expect(cloudAssertionClientId(assertion)).toBe(id)
    const check = await verifyCloudClientAssertion(assertion, keys.publicKey, AUD, T0 + 1000)
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.claims).toMatchObject({ iss: id, sub: id, aud: AUD })
    expect(check.claims.exp - check.claims.iat).toBe(60)
    expect(JSON.parse(fromUtf8(fromBase64url(assertion.split('.')[0])!))).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: id })
  })

  it('no two have the same jti', async () => {
    const keys = await generateCloudConnectionKeys()
    const a = claimsOf(await signCloudClientAssertion(keys, AUD, T0))
    const b = claimsOf(await signCloudClientAssertion(keys, AUD, T0))
    expect(a.jti).not.toBe(b.jti)
  })

  it('is refused under another key, at another endpoint, out of its time, or changed', async () => {
    const keys = await generateCloudConnectionKeys()
    const other = await generateCloudConnectionKeys()
    const assertion = await signCloudClientAssertion(keys, AUD, T0)
    const reason = async (a: string, key = keys.publicKey, aud = AUD, now = T0) => {
      const check = await verifyCloudClientAssertion(a, key, aud, now)
      return check.ok ? 'ok' : check.reason
    }
    expect(await reason(assertion, other.publicKey)).toBe('wrong_key')
    expect(await reason(assertion, keys.publicKey, 'https://cloud.example.com/connect/revoke')).toBe('wrong_audience')
    expect(await reason(assertion, keys.publicKey, AUD, T0 + 3 * 60_000)).toBe('expired')
    expect(await reason(assertion, keys.publicKey, AUD, T0 - 3 * 60_000)).toBe('not_yet_valid')
    expect(await reason(withClaims(assertion, { aud: 'https://elsewhere.example' }))).toBe('bad_signature')
    expect(await reason('a.b')).toBe('malformed')
    const [, body, sig] = assertion.split('.')
    expect(await reason([toBase64url(utf8(JSON.stringify({ alg: 'none' }))), body, sig].join('.'))).toBe('malformed')
  })

})
