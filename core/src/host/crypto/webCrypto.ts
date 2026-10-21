/**
 * The standard Web Crypto API, as Node provides it on `globalThis.crypto` (the same object as `node:crypto`'s
 * `webcrypto`). Core compiles without Node's or the browser's type libraries, so the few calls used here are typed by
 * hand; every primitive is the platform's own — no dependency implements any of it.
 */

export type Bytes = Uint8Array

/** An opaque key handle from the platform. */
export type CryptoKeyHandle = { readonly type: string; readonly algorithm: { name: string } }
type KeyPair = { publicKey: CryptoKeyHandle; privateKey: CryptoKeyHandle }

type Algorithm =
  | { name: 'Ed25519' }
  | { name: 'X25519' }
  | { name: 'HMAC'; hash: 'SHA-256' }
  | { name: 'HKDF' }
  | { name: 'AES-GCM' }

type Subtle = {
  generateKey(alg: { name: 'Ed25519' | 'X25519' }, extractable: boolean, usages: string[]): Promise<KeyPair>
  importKey(format: 'raw' | 'pkcs8', data: Bytes, alg: Algorithm, extractable: boolean, usages: string[]): Promise<CryptoKeyHandle>
  exportKey(format: 'raw' | 'pkcs8', key: CryptoKeyHandle): Promise<ArrayBuffer>
  sign(alg: { name: 'Ed25519' } | { name: 'HMAC' }, key: CryptoKeyHandle, data: Bytes): Promise<ArrayBuffer>
  verify(alg: { name: 'Ed25519' } | { name: 'HMAC' }, key: CryptoKeyHandle, signature: Bytes, data: Bytes): Promise<boolean>
  deriveBits(
    alg: { name: 'X25519'; public: CryptoKeyHandle } | { name: 'HKDF'; hash: 'SHA-256'; salt: Bytes; info: Bytes },
    key: CryptoKeyHandle,
    length: number,
  ): Promise<ArrayBuffer>
  encrypt(alg: { name: 'AES-GCM'; iv: Bytes; additionalData: Bytes }, key: CryptoKeyHandle, data: Bytes): Promise<ArrayBuffer>
  decrypt(alg: { name: 'AES-GCM'; iv: Bytes; additionalData: Bytes }, key: CryptoKeyHandle, data: Bytes): Promise<ArrayBuffer>
  digest(alg: 'SHA-256', data: Bytes): Promise<ArrayBuffer>
}

type Platform = {
  crypto?: { subtle: Subtle; getRandomValues(array: Bytes): Bytes }
  TextEncoder?: new () => { encode(text: string): Bytes }
  TextDecoder?: new (label: string, options: { fatal: boolean }) => { decode(bytes: Bytes): string }
}

const platform = globalThis as unknown as Platform

function webCrypto(): NonNullable<Platform['crypto']> {
  if (!platform.crypto?.subtle) throw new Error('This runtime has no Web Crypto API')
  return platform.crypto
}

export const subtle = (): Subtle => webCrypto().subtle

export function randomBytes(length: number): Bytes {
  return webCrypto().getRandomValues(new Uint8Array(length))
}

export function utf8(text: string): Bytes {
  if (!platform.TextEncoder) throw new Error('This runtime has no TextEncoder')
  return new platform.TextEncoder().encode(text)
}

/** Strict: bytes that are not UTF-8 throw rather than decode to replacement characters. */
export function fromUtf8(bytes: Bytes): string {
  if (!platform.TextDecoder) throw new Error('This runtime has no TextDecoder')
  return new platform.TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]))

export function toBase64url(bytes: Bytes): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += B64[n & 63]
  }
  return out
}

/** Strict: anything but canonical unpadded base64url is null, so one value never has two spellings. */
export function fromBase64url(text: string): Bytes | null {
  if (text.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let bits = 0
  let acc = 0
  let o = 0
  for (const c of text) {
    const v = B64_INDEX.get(c)
    if (v === undefined) return null
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
    }
  }
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null
  return out
}

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function toHex(bytes: Bytes): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Lower- or upper-case hex to bytes; null unless it is whole bytes of hex. */
export function fromHex(text: string): Bytes | null {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) return null
  return new Uint8Array(text.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
}

/** HMAC-SHA-256 under a raw key. */
export async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle().sign({ name: 'HMAC' }, k, data))
}

/** Checks an HMAC in constant time, by the platform's own verify. */
export async function hmacMatches(key: Bytes, data: Bytes, mac: Bytes): Promise<boolean> {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return subtle().verify({ name: 'HMAC' }, k, mac, data)
}

export async function hkdf(ikm: Bytes, salt: Bytes, info: Bytes, bytes = 32): Promise<Bytes> {
  const k = await subtle().importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8))
}

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle().digest('SHA-256', data))
}

/** A fixed-order list of strings as bytes: the one way anything here is serialised before it is signed or MACed. */
export function canonical(parts: (string | number)[]): Bytes {
  return utf8(JSON.stringify(parts))
}
