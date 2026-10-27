/**
 * Signs tokens for the verification tests the way hq does (RS256, a key id in the header), with keys made in the test
 * by the platform's Web Crypto API. Also makes the tokens hq never makes: `alg: none`, HS256, a tampered payload.
 */
import { toBase64url, utf8 } from '../../host/crypto/webCrypto.js'
import type { JsonWebKeySet, PublicJsonWebKey } from '../rs256.js'

type Key = { readonly type: string }
type TestSubtle = {
  generateKey(alg: object, extractable: boolean, usages: string[]): Promise<{ publicKey: Key; privateKey: Key }>
  exportKey(format: 'jwk', key: Key): Promise<Record<string, unknown>>
  importKey(format: 'raw', data: Uint8Array, alg: object, extractable: boolean, usages: string[]): Promise<Key>
  sign(alg: object, key: Key, data: Uint8Array): Promise<ArrayBuffer>
}
const subtle = (globalThis as unknown as { crypto: { subtle: TestSubtle } }).crypto.subtle

const b64json = (value: unknown) => toBase64url(utf8(JSON.stringify(value)))

export type TestSigner = {
  kid: string
  jwk: PublicJsonWebKey
  keys: JsonWebKeySet
  sign(payload: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>
}

export async function makeSigner(kid = 'hq-key-1'): Promise<TestSigner> {
  const pair = await subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const { kty, n, e } = await subtle.exportKey('jwk', pair.publicKey) as { kty: string; n: string; e: string }
  const jwk: PublicJsonWebKey = { kty, n, e, kid, alg: 'RS256', use: 'sig' }
  return {
    kid,
    jwk,
    keys: { keys: [jwk] },
    async sign(payload, header = { alg: 'RS256', kid }) {
      const input = `${b64json(header)}.${b64json(payload)}`
      const sig = await subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, utf8(input))
      return `${input}.${toBase64url(new Uint8Array(sig))}`
    },
  }
}

/** An HS256 token whose secret is the given text: the classic attack of using the public key as the secret. */
export async function signHs256(payload: Record<string, unknown>, secret: string, kid: string): Promise<string> {
  const key = await subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const input = `${b64json({ alg: 'HS256', kid })}.${b64json(payload)}`
  return `${input}.${toBase64url(new Uint8Array(await subtle.sign({ name: 'HMAC' }, key, utf8(input))))}`
}

export function unsigned(payload: Record<string, unknown>, kid: string): string {
  return `${b64json({ alg: 'none', kid })}.${b64json(payload)}.`
}

/** The same token with its payload swapped for another, keeping the original signature. */
export function withPayload(token: string, payload: Record<string, unknown>): string {
  const [h, , s] = token.split('.')
  return `${h}.${b64json(payload)}.${s}`
}
