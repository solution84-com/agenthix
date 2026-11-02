/**
 * Sealing and opening a `HostEnvelope` (see ../envelope.ts for what it guarantees and why).
 *
 * Seal: a one-time X25519 key agreed with the recipient's sealing key → HKDF-SHA-256 (salt: the envelope id; info:
 * both fingerprints and the one-time key) → AES-256-GCM over the message, with the header as additional data → an
 * Ed25519 signature over the header and the ciphertext.
 *
 * Open checks, in order and before decrypting anything: the shape, that it is for us, its times, that the sender is
 * pinned, the signature, and that its id is new. Only then is it decrypted. The one exception is an envelope inside the
 * recipient's start window that may be an answer it awaits (`awaited`): it is decrypted, signature checked, to tell.
 */
import {
  HOST_ENVELOPE_CLOCK_SKEW_MS, HOST_ENVELOPE_DEFAULT_LIFETIME_MS, HOST_ENVELOPE_MAX_BODY_BYTES,
  HOST_ENVELOPE_MAX_LIFETIME_MS, HOST_ENVELOPE_VERSION, parseHostEnvelope,
  type EnvelopeRefusal, type HostEnvelope, type HostIdentity, type SealedMessage,
} from '../envelope.js'
import {
  fingerprintOf, importSealingPrivateKey, importSealingPublicKey, importSigningPrivateKey, importSigningPublicKey,
  type HostKeys,
} from './keys.js'
import type { EnvelopeReplayGuard } from './replay.js'
import { canonical, fromBase64url, fromUtf8, hkdf, randomBytes, subtle, toBase64url, utf8, type Bytes } from './webCrypto.js'

const LABEL = 'host-envelope/1'

type Header = Omit<HostEnvelope, 'ct' | 'sig'>

const aad = (h: Header): Bytes => canonical([`${LABEL}/aad`, h.v, h.from, h.to, h.id, h.sentAt, h.expiresAt, h.epk, h.iv])
const signed = (h: Header, ct: string): Bytes =>
  canonical([`${LABEL}/sig`, h.v, h.from, h.to, h.id, h.sentAt, h.expiresAt, h.epk, h.iv, ct])

async function messageKey(shared: Bytes, h: Header) {
  const salt = fromBase64url(h.id)!
  const raw = await hkdf(shared, salt, canonical([`${LABEL}/key`, h.from, h.to, h.epk]))
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export type SealOptions = {
  sender: HostKeys
  recipient: HostIdentity
  message: SealedMessage
  now?: number
  lifetimeMs?: number
}

export async function sealEnvelope({ sender, recipient, message, now = Date.now(), lifetimeMs }: SealOptions): Promise<HostEnvelope> {
  const lifetime = Math.min(lifetimeMs ?? HOST_ENVELOPE_DEFAULT_LIFETIME_MS, HOST_ENVELOPE_MAX_LIFETIME_MS)
  const body = utf8(JSON.stringify(message))
  if (body.length > HOST_ENVELOPE_MAX_BODY_BYTES) throw new Error('Message too large for an envelope')

  const ephemeral = await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])
  const header: Header = {
    v: HOST_ENVELOPE_VERSION,
    from: await fingerprintOf(sender.identity),
    to: await fingerprintOf(recipient),
    id: toBase64url(randomBytes(16)),
    sentAt: now,
    expiresAt: now + lifetime,
    epk: toBase64url(new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey))),
    iv: toBase64url(randomBytes(12)),
  }
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'X25519', public: await importSealingPublicKey(recipient.sealingKey) }, ephemeral.privateKey, 256),
  )
  const key = await messageKey(shared, header)
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: fromBase64url(header.iv)!, additionalData: aad(header) }, key, body,
  )
  const ct = toBase64url(new Uint8Array(ciphertext))
  const signingKey = await importSigningPrivateKey(sender.signingPrivateKey)
  const sig = toBase64url(new Uint8Array(await subtle().sign({ name: 'Ed25519' }, signingKey, signed(header, ct))))
  return { ...header, ct, sig }
}

export type OpenOptions = {
  recipient: HostKeys
  /** The pinned identity for a fingerprint, or null when it is not pinned. */
  pinned: (fingerprint: string) => HostIdentity | null | Promise<HostIdentity | null>
  replay: EnvelopeReplayGuard
  now?: number
  /**
   * Whether a message answers something the recipient made at random since it started and still waits on (a request
   * id, an envelope id, an ask id), from that sender. Only such a message is opened inside the replay guard's start
   * window; it is decrypted to tell, and its id is still recorded, so a second copy is refused as replayed.
   */
  awaited?: (message: unknown, fromFingerprint: string) => boolean
}

/**
 * The message is returned as it was sealed, still unchecked: a request goes through `parseHostRequest` before
 * anything acts on it. The envelope proves who sent it, not that it is well-formed.
 */
export type OpenResult =
  | { ok: true; from: HostIdentity; fromFingerprint: string; envelopeId: string; message: unknown }
  | { ok: false; reason: EnvelopeRefusal; envelopeId: string | null }

export async function openEnvelope(data: unknown, { recipient, pinned, replay, now = Date.now(), awaited }: OpenOptions): Promise<OpenResult> {
  const env = parseHostEnvelope(data)
  if (!env) {
    const v = data && typeof data === 'object' ? (data as Record<string, unknown>).v : undefined
    return { ok: false, reason: v !== undefined && v !== HOST_ENVELOPE_VERSION ? 'unsupported_version' : 'malformed', envelopeId: null }
  }
  const refuse = (reason: EnvelopeRefusal): OpenResult => ({ ok: false, reason, envelopeId: env.id })

  if (env.to !== (await fingerprintOf(recipient.identity))) return refuse('wrong_recipient')
  if (env.expiresAt <= now) return refuse('expired')
  if (env.sentAt > now + HOST_ENVELOPE_CLOCK_SKEW_MS) return refuse('not_yet_valid')
  if (env.expiresAt - env.sentAt > HOST_ENVELOPE_MAX_LIFETIME_MS || env.expiresAt <= env.sentAt) return refuse('lifetime_too_long')

  const sender = await pinned(env.from)
  if (!sender || (await fingerprintOf(sender)) !== env.from) return refuse('unknown_sender')

  const { ct, sig, ...header } = env
  const sigBytes = fromBase64url(sig)
  const ivBytes = fromBase64url(env.iv)
  const ctBytes = fromBase64url(ct)
  if (!sigBytes || sigBytes.length !== 64 || !ivBytes || ivBytes.length !== 12 || !ctBytes || !fromBase64url(env.id)) {
    return refuse('malformed')
  }
  const verifyKey = await importSigningPublicKey(sender)
  if (!(await subtle().verify({ name: 'Ed25519' }, verifyKey, sigBytes, signed(header, ct)))) return refuse('bad_signature')

  // Inside the start window only an awaited answer may pass, which takes reading it; everything else is decided here.
  const early = awaited !== undefined && replay.inStartWindow(env.sentAt)
  if (!early) {
    const admitted = replay.admit(env.id, env.sentAt, env.expiresAt, now)
    if (admitted !== 'ok') return refuse(admitted)
  }

  let plaintext: Bytes
  try {
    const sealingKey = await importSealingPrivateKey(recipient.sealingPrivateKey)
    const shared = new Uint8Array(
      await subtle().deriveBits({ name: 'X25519', public: await importSealingPublicKey(env.epk) }, sealingKey, 256),
    )
    const key = await messageKey(shared, header)
    plaintext = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: ivBytes, additionalData: aad(header) }, key, ctBytes))
  } catch {
    return refuse('undecryptable')
  }
  if (plaintext.length > HOST_ENVELOPE_MAX_BODY_BYTES) return refuse('too_large')
  let message: unknown
  try {
    message = JSON.parse(fromUtf8(plaintext))
  } catch {
    return refuse('malformed')
  }
  if (early) {
    if (!awaited(message, env.from)) return refuse('stale')
    const admitted = replay.admit(env.id, env.sentAt, env.expiresAt, now, true)
    if (admitted !== 'ok') return refuse(admitted)
  }
  return { ok: true, from: sender, fromFingerprint: env.from, envelopeId: env.id, message }
}
