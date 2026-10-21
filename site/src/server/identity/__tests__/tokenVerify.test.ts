import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, base64url, type JWK } from 'jose'
import { HQ_TOKEN_ISSUER } from '@agenthix/core'
import { verifyWithKeySet } from '../tokenVerify'
import type { webcrypto } from 'node:crypto'

type CryptoKey = webcrypto.CryptoKey

let keySet: ReturnType<typeof createLocalJWKSet>
let signKey: CryptoKey
let otherKey: CryptoKey
let publicJwk: JWK

async function mint(key: CryptoKey, opts: { issuer?: string; expiresIn?: number; tokenType?: string } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ tokenType: opts.tokenType ?? 'identity', role: 'MEMBER' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('u1').setIssuer(opts.issuer ?? HQ_TOKEN_ISSUER)
    .setIssuedAt(now).setExpirationTime(now + (opts.expiresIn ?? 3600))
    .sign(key)
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signKey = pair.privateKey
  publicJwk = await exportJWK(pair.publicKey)
  keySet = createLocalJWKSet({ keys: [{ ...publicJwk, alg: 'RS256', use: 'sig' }] })
  otherKey = (await generateKeyPair('RS256')).privateKey
})

describe('site verifies hq tokens locally @SC-271', () => {
  it('accepts a valid hq-signed token and returns its claims', async () => {
    const payload = await verifyWithKeySet(await mint(signKey), keySet)
    expect(payload.sub).toBe('u1')
    expect(payload.role).toBe('MEMBER')
  })

  it('rejects a token signed by a different key', async () => {
    await expect(verifyWithKeySet(await mint(otherKey), keySet)).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    await expect(verifyWithKeySet(await mint(signKey, { expiresIn: -60 }), keySet)).rejects.toThrow()
  })

  it('rejects a wrong issuer', async () => {
    await expect(verifyWithKeySet(await mint(signKey, { issuer: 'someone-else' }), keySet)).rejects.toThrow()
  })

  // The classic "alg confusion" attack: an attacker who knows the RSA public
  // key (published at HQ_JWKS_PATH, deliberately public) re-signs a token with
  // HS256, using the public key's modulus as the HMAC secret. If the verifier
  // ever accepted whatever `alg` the token's header claims, this would pass —
  // pinning `algorithms: ['RS256']` (tokenVerify.ts) is what stops it.
  it('rejects an HS256 token forged using the RSA public key as the HMAC secret', async () => {
    const now = Math.floor(Date.now() / 1000)
    const hmacSecret = base64url.decode(publicJwk.n!)
    const forged = await new SignJWT({ tokenType: 'identity', role: 'MEMBER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1').setIssuer(HQ_TOKEN_ISSUER)
      .setIssuedAt(now).setExpirationTime(now + 3600)
      .sign(hmacSecret)
    await expect(verifyWithKeySet(forged, keySet)).rejects.toThrow()
  })

  // Identity and capability tokens share an issuer, a key and a subject —
  // `tokenType` is the only thing separating them, so cross-use must be rejected.
  it('rejects cross-use between token types but accepts a matching type', async () => {
    const identityToken = await mint(signKey, { tokenType: 'identity' })
    await expect(verifyWithKeySet(identityToken, keySet, 'capability')).rejects.toThrow()
    await expect(verifyWithKeySet(identityToken, keySet, 'identity')).resolves.toBeDefined()
  })
})

describe('a token minted for another site is refused @SC-289', () => {
  async function mintWithAudience(audience: string) {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ tokenType: 'capability' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('u1').setIssuer(HQ_TOKEN_ISSUER).setAudience(audience)
      .setIssuedAt(now).setExpirationTime(now + 3600)
      .sign(signKey)
  }

  it('rejects a mismatched audience', async () => {
    const token = await mintWithAudience('some-other-site')
    await expect(verifyWithKeySet(token, keySet, undefined, 'this-site')).rejects.toThrow()
  })

  it('accepts a matching audience', async () => {
    const token = await mintWithAudience('this-site')
    await expect(verifyWithKeySet(token, keySet, undefined, 'this-site')).resolves.toBeDefined()
  })
})
