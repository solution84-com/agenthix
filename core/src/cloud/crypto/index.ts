/**
 * `@agenthix/core/cloud-crypto`: the cryptography of the connection protocol (../connection.ts) — hq's Ed25519 key,
 * the client id worked out from it, and the client assertions hq signs and Cloud verifies. Kept off the root entry,
 * like `host-crypto`, so nothing a browser bundle reaches from `@agenthix/core` carries it. Every primitive is the
 * platform's Web Crypto.
 */
import {
  CLOUD_ASSERTION_ALG, CLOUD_ASSERTION_CLOCK_SKEW_S, CLOUD_ASSERTION_LIFETIME_S, CLOUD_ASSERTION_MAX_LIFETIME_S,
  isCloudPublicKey, type CloudClientAssertionClaims,
} from '../connection.js'
import { fromBase64url, fromUtf8, randomBytes, sha256, subtle, toBase64url, utf8 } from '../../host/crypto/webCrypto.js'

export type CloudConnectionKeys = {
  /** Raw 32 bytes, unpadded base64url: what hq sends Cloud. */
  publicKey: string
  /** PKCS #8, base64url. Secret: kept with hq's encrypted secrets and nowhere else. */
  privateKey: string
}

export async function generateCloudConnectionKeys(): Promise<CloudConnectionKeys> {
  const pair = await subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  return {
    publicKey: toBase64url(new Uint8Array(await subtle().exportKey('raw', pair.publicKey))),
    privateKey: toBase64url(new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey))),
  }
}

/** The RFC 7638 thumbprint of the key as an OKP JWK (RFC 8037): the client id, on both sides. */
export async function cloudClientIdOf(publicKey: string): Promise<string> {
  if (!isCloudPublicKey(publicKey)) throw new Error('Not an Ed25519 public key')
  const jwk = `{"crv":"Ed25519","kty":"OKP","x":"${publicKey}"}`
  return toBase64url(await sha256(utf8(jwk)))
}

const encodePart = (value: object) => toBase64url(utf8(JSON.stringify(value)))

/**
 * hq's side: a client assertion for one request to `audience`, the endpoint's URL. Its `jti` is random, so no two
 * are alike; it lives `CLOUD_ASSERTION_LIFETIME_S`.
 */
export async function signCloudClientAssertion(keys: CloudConnectionKeys, audience: string, now: number = Date.now()): Promise<string> {
  const clientId = await cloudClientIdOf(keys.publicKey)
  const pkcs8 = fromBase64url(keys.privateKey)
  if (!pkcs8) throw new Error('Not a private key')
  const key = await subtle().importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign'])
  const iat = Math.floor(now / 1000)
  const claims: CloudClientAssertionClaims = {
    iss: clientId, sub: clientId, aud: audience, jti: toBase64url(randomBytes(18)), iat, exp: iat + CLOUD_ASSERTION_LIFETIME_S,
  }
  const input = `${encodePart({ alg: CLOUD_ASSERTION_ALG, typ: 'JWT', kid: clientId })}.${encodePart(claims)}`
  const signature = new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, utf8(input)))
  return `${input}.${toBase64url(signature)}`
}

export type CloudAssertionCheck =
  | { ok: true; claims: CloudClientAssertionClaims }
  | { ok: false; reason: 'malformed' | 'wrong_key' | 'bad_signature' | 'wrong_audience' | 'expired' | 'not_yet_valid' | 'too_long' }

function decodePart(part: string): Record<string, unknown> | null {
  const bytes = fromBase64url(part)
  if (!bytes) return null
  try {
    const v: unknown = JSON.parse(fromUtf8(bytes))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The client id an assertion claims, before anything is checked: Cloud looks the key up by it. Null if malformed. */
export function cloudAssertionClientId(assertion: string): string | null {
  const parts = assertion.split('.')
  if (parts.length !== 3) return null
  const claims = decodePart(parts[1])
  return typeof claims?.iss === 'string' ? claims.iss : null
}

/**
 * Cloud's side: checks an assertion against the public key registered for its client id and the endpoint it arrived
 * at. Everything RFC 7523 §3 asks but `jti` replay, which needs the server's memory (each `jti` kept until its `exp`
 * plus the clock skew): a caller refuses one it has seen.
 */
export async function verifyCloudClientAssertion(
  assertion: string, publicKey: string, audience: string, now: number = Date.now(),
): Promise<CloudAssertionCheck> {
  const parts = assertion.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const header = decodePart(parts[0])
  const c = decodePart(parts[1])
  const signature = fromBase64url(parts[2])
  if (!header || !c || !signature || header.alg !== CLOUD_ASSERTION_ALG) return { ok: false, reason: 'malformed' }
  const claims = readClaims(c)
  if (!claims) return { ok: false, reason: 'malformed' }
  const clientId = await cloudClientIdOf(publicKey)
  if (claims.iss !== clientId || claims.sub !== clientId || (header.kid !== undefined && header.kid !== clientId)) {
    return { ok: false, reason: 'wrong_key' }
  }
  const raw = fromBase64url(publicKey)
  if (!raw) return { ok: false, reason: 'wrong_key' }
  const key = await subtle().importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
  if (!(await subtle().verify({ name: 'Ed25519' }, key, signature, utf8(`${parts[0]}.${parts[1]}`)))) {
    return { ok: false, reason: 'bad_signature' }
  }
  if (claims.aud !== audience) return { ok: false, reason: 'wrong_audience' }
  const seconds = Math.floor(now / 1000)
  if (claims.exp - claims.iat > CLOUD_ASSERTION_MAX_LIFETIME_S) return { ok: false, reason: 'too_long' }
  if (claims.exp + CLOUD_ASSERTION_CLOCK_SKEW_S <= seconds) return { ok: false, reason: 'expired' }
  if (claims.iat - CLOUD_ASSERTION_CLOCK_SKEW_S > seconds) return { ok: false, reason: 'not_yet_valid' }
  return { ok: true, claims }
}

function readClaims(c: Record<string, unknown>): CloudClientAssertionClaims | null {
  const { iss, sub, aud, jti, iat, exp } = c
  if (typeof iss !== 'string' || typeof sub !== 'string' || typeof aud !== 'string') return null
  if (typeof jti !== 'string' || jti.length < 16 || jti.length > 128) return null
  if (typeof iat !== 'number' || typeof exp !== 'number' || !Number.isInteger(iat) || !Number.isInteger(exp) || exp <= iat) return null
  return { iss, sub, aud, jti, iat, exp }
}

export { checkCloudIdToken, newCloudFlowValue, pkceChallengeOf, type CloudIdTokenCheck } from './signIn.js'
