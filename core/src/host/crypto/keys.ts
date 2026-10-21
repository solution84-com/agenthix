/**
 * A party's keys: Ed25519 to sign, X25519 to be sealed to. The public half is its `HostIdentity`, named by one
 * fingerprint over both keys, so pinning a fingerprint pins both. The private half is kept as PKCS #8, base64url, in
 * the owner's state folder and nowhere else.
 */
import type { HostIdentity, HostPeerRole } from '../envelope.js'
import { isFingerprint } from '../envelope.js'
import { canonical, concat, fromBase64url, sha256, subtle, toBase64url, toHex, type CryptoKeyHandle } from './webCrypto.js'

export type HostKeys = {
  identity: HostIdentity
  /** PKCS #8, base64url. Secret. */
  signingPrivateKey: string
  sealingPrivateKey: string
}

export async function generateHostKeys(role: HostPeerRole): Promise<HostKeys> {
  const signing = await subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const sealing = await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])
  const raw = async (k: CryptoKeyHandle) => toBase64url(new Uint8Array(await subtle().exportKey('raw', k)))
  const pkcs8 = async (k: CryptoKeyHandle) => toBase64url(new Uint8Array(await subtle().exportKey('pkcs8', k)))
  return {
    identity: { role, signingKey: await raw(signing.publicKey), sealingKey: await raw(sealing.publicKey) },
    signingPrivateKey: await pkcs8(signing.privateKey),
    sealingPrivateKey: await pkcs8(sealing.privateKey),
  }
}

/** A public key as it travels: exactly 32 bytes of base64url. Null when it is not. */
export function publicKeyBytes(value: string): Uint8Array | null {
  const bytes = fromBase64url(value)
  return bytes && bytes.length === 32 ? bytes : null
}

export function isHostIdentity(v: unknown): v is HostIdentity {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const d = v as Record<string, unknown>
  return (
    (d.role === 'console' || d.role === 'host' || d.role === 'cloud') &&
    typeof d.signingKey === 'string' && publicKeyBytes(d.signingKey) !== null &&
    typeof d.sealingKey === 'string' && publicKeyBytes(d.sealingKey) !== null
  )
}

/** SHA-256 over the role and both public keys; 64 lower-case hex digits. */
export async function fingerprintOf(identity: HostIdentity): Promise<string> {
  const signing = publicKeyBytes(identity.signingKey)
  const sealing = publicKeyBytes(identity.sealingKey)
  if (!signing || !sealing) throw new Error('Not a host identity')
  const fp = toHex(await sha256(concat(canonical(['host-identity/1', identity.role]), signing, sealing)))
  if (!isFingerprint(fp)) throw new Error('Fingerprint is not 64 hex digits')
  return fp
}

export async function importSigningPublicKey(identity: HostIdentity): Promise<CryptoKeyHandle> {
  const raw = publicKeyBytes(identity.signingKey)
  if (!raw) throw new Error('Not a signing key')
  return subtle().importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
}

export async function importSealingPublicKey(value: string): Promise<CryptoKeyHandle> {
  const raw = publicKeyBytes(value)
  if (!raw) throw new Error('Not a sealing key')
  return subtle().importKey('raw', raw, { name: 'X25519' }, false, [])
}

export async function importSigningPrivateKey(pkcs8: string): Promise<CryptoKeyHandle> {
  const raw = fromBase64url(pkcs8)
  if (!raw) throw new Error('Not a private key')
  return subtle().importKey('pkcs8', raw, { name: 'Ed25519' }, false, ['sign'])
}

export async function importSealingPrivateKey(pkcs8: string): Promise<CryptoKeyHandle> {
  const raw = fromBase64url(pkcs8)
  if (!raw) throw new Error('Not a private key')
  return subtle().importKey('pkcs8', raw, { name: 'X25519' }, false, ['deriveBits'])
}
