/**
 * A compact JWT's parts, and an RS256 signature checked against a JSON Web Key by the platform's Web Crypto API.
 * Core compiles without Node's or the browser's type libraries, so the two calls used are typed by hand.
 */
import { fromBase64url, fromUtf8, utf8 } from '../host/crypto/webCrypto.js'

/** One public key as hq publishes it at `HQ_JWKS_PATH`. Only RSA signing keys are used. */
export interface PublicJsonWebKey {
  kty: string
  kid?: string
  n?: string
  e?: string
  alg?: string
  use?: string
}

/** hq's key set, as `HQ_JWKS_PATH` answers it. The caller fetches and caches it; core does no I/O. */
export interface JsonWebKeySet {
  keys: PublicJsonWebKey[]
}

type KeyHandle = { readonly type: string }
type RsaSubtle = {
  importKey(
    format: 'jwk', key: { kty: 'RSA'; n: string; e: string; alg: 'RS256'; ext: boolean },
    alg: { name: 'RSASSA-PKCS1-v1_5'; hash: 'SHA-256' }, extractable: boolean, usages: string[],
  ): Promise<KeyHandle>
  verify(alg: { name: 'RSASSA-PKCS1-v1_5' }, key: KeyHandle, signature: Uint8Array, data: Uint8Array): Promise<boolean>
}

function subtle(): RsaSubtle {
  const c = (globalThis as unknown as { crypto?: { subtle?: RsaSubtle } }).crypto
  if (!c?.subtle) throw new Error('This runtime has no Web Crypto API')
  return c.subtle
}

export type CompactJwt = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signingInput: Uint8Array
  signature: Uint8Array
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function decodeJson(part: string): Record<string, unknown> | null {
  const bytes = fromBase64url(part)
  if (!bytes) return null
  try {
    const value: unknown = JSON.parse(fromUtf8(bytes))
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

/** Longer than any ticket hq signs by far; a bound so a hostile link costs nothing to refuse. */
export const MAX_COMPACT_JWT_LENGTH = 8192

/** The three parts of a compact JWS, decoded; null for anything else. Checks nothing about what they say: an empty
 * signature (`alg: none`) parses, so it is refused as forged rather than malformed. */
export function parseCompactJwt(token: string): CompactJwt | null {
  if (typeof token !== 'string' || token.length > MAX_COMPACT_JWT_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const header = decodeJson(h)
  const payload = decodeJson(p)
  const signature = fromBase64url(s)
  if (!header || !payload || !signature) return null
  return { header, payload, signingInput: utf8(`${h}.${p}`), signature }
}

/** Imported keys, by the key object the caller passed, so a cached key set is imported once. */
const imported = new WeakMap<PublicJsonWebKey, Promise<KeyHandle>>()

function importRsaKey(jwk: PublicJsonWebKey): Promise<KeyHandle> {
  let key = imported.get(jwk)
  if (!key) {
    key = subtle().importKey(
      'jwk', { kty: 'RSA', n: jwk.n!, e: jwk.e!, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    )
    imported.set(jwk, key)
  }
  return key
}

/** A key fit to check an RS256 signature: RSA, and if it states an algorithm or a use, RS256 and signing. */
export function isRs256Key(jwk: PublicJsonWebKey): boolean {
  return jwk.kty === 'RSA' && typeof jwk.n === 'string' && typeof jwk.e === 'string'
    && (jwk.alg === undefined || jwk.alg === 'RS256') && (jwk.use === undefined || jwk.use === 'sig')
}

export async function rs256Verifies(jwk: PublicJsonWebKey, jwt: CompactJwt): Promise<boolean> {
  try {
    return await subtle().verify({ name: 'RSASSA-PKCS1-v1_5' }, await importRsaKey(jwk), jwt.signature, jwt.signingInput)
  } catch {
    imported.delete(jwk)
    return false
  }
}
