/**
 * The envelope between the Fleet Console (or the Cloud controller) and a host service (host-management spec §2, §4
 * C3, §7). hq relays it and can pass or drop it, but cannot read it or make one up:
 *
 * - **Signed** with the sender's Ed25519 key, over every field but the signature, so neither its header nor its
 *   ciphertext can be changed, and nobody without the sender's key can write one.
 * - **Sealed** to the recipient: a fresh X25519 key per envelope, agreed with the recipient's pinned X25519 key,
 *   through HKDF-SHA-256 to an AES-256-GCM key. The header is the cipher's additional data.
 * - **Fresh**: a random id, a send time and an expiry. The recipient refuses an expired envelope, one sent too far
 *   in the future, one that lives too long, and any id it has already accepted (replay).
 *
 * Each side pins the other's identity — both public keys, named by one fingerprint — when the machine connects
 * (join.ts), and accepts envelopes only from a pinned identity. The cryptography is in `@agenthix/core/host-crypto`;
 * this module holds what both ends and hq agree on, and nothing that needs a crypto implementation.
 */
import type { HostActor, HostRequest, HostResult } from './operations.js'
import type { HostFigures } from './figures.js'
import type { ScheduledChangeNotice } from './scheduledChange.js'
import type { HandedOverHost, ConsoleHandoverCertificate } from './join.js'
import type { MoveReport, TransferStep } from './transfer.js'
import type { HostStoppingMessage } from './stopping.js'
import type { CloudControllerMessage } from './cloud.js'

export const HOST_ENVELOPE_VERSION = 1

/** How long an envelope lives unless its sender says less. */
export const HOST_ENVELOPE_DEFAULT_LIFETIME_MS = 2 * 60_000
/** The most an envelope may live: it bounds how long a recipient must remember its id. */
export const HOST_ENVELOPE_MAX_LIFETIME_MS = 5 * 60_000
/** How far ahead of the recipient's clock a sender's may run. */
export const HOST_ENVELOPE_CLOCK_SKEW_MS = 30_000
/** The most plaintext one envelope carries; a backup travels another way. */
export const HOST_ENVELOPE_MAX_BODY_BYTES = 1024 * 1024

export type HostPeerRole = 'console' | 'host' | 'cloud'

/** A party's public identity. Keys are raw public keys, base64url. */
export type HostIdentity = {
  role: HostPeerRole
  signingKey: string
  sealingKey: string
}

/**
 * On the wire, as hq relays it. `from` and `to` are full fingerprints, which is what hq routes by and all it learns
 * besides the times and the size.
 */
export type HostEnvelope = {
  v: typeof HOST_ENVELOPE_VERSION
  from: string
  to: string
  /** 16 random bytes, base64url: the replay key. */
  id: string
  /** Milliseconds since the epoch, by the sender's clock. */
  sentAt: number
  expiresAt: number
  /** The sender's one-time X25519 public key, base64url. */
  epk: string
  /** AES-GCM nonce, 12 bytes, base64url. */
  iv: string
  /** Ciphertext with its 16-byte tag, base64url. */
  ct: string
  /** Ed25519 signature over the header and ciphertext, base64url. */
  sig: string
}

/** What is sealed inside an envelope. */
export type HostMessage =
  | { kind: 'request'; requestId: string; by: HostActor; request: HostRequest }
  | { kind: 'result'; replyTo: string; result: HostResult }
  | { kind: 'figures'; figures: HostFigures }
  | { kind: 'scheduledChange'; notice: ScheduledChangeNotice }
  /** An envelope the recipient refused, told back to its sender sealed, so hq cannot make up a refusal. */
  | { kind: 'refused'; envelopeId: string; reason: EnvelopeRefusal }
  /**
   * The running Fleet Console → the new one, while it moves (join.ts): the certificate the machines will follow, and
   * the machines it pinned. Sealed, so hq neither reads the fleet nor puts machines of its own in it.
   */
  | { kind: 'handoverState'; certificate: ConsoleHandoverCertificate; hosts: HandedOverHost[] }
  /** A host service → the Fleet Console it pinned on a handover certificate: it follows it now. */
  | { kind: 'handedOver'; previous: string }
  /**
   * HQ's machine's host service → the Fleet Console it pins, when that one runs elsewhere: `agenthix hq console-code`
   * asks it for a handover code. Answered only for the pinned machine that carries hq (join.ts).
   */
  | { kind: 'handoverCodeAsk'; askId: string }
  /** The answer, sealed to the machine that asked, so the code never reaches hq. */
  | { kind: 'handoverCode'; replyTo: string; answer: HandoverCodeAnswer }
  /** Between the two host services of a site's move (transfer.ts), never to or from a Fleet Console. */
  | { kind: 'transfer'; transferId: string; step: TransferStep }
  /** A host service → the Fleet Console it pins: how a move it takes part in went. */
  | { kind: 'move'; report: MoveReport }
  /**
   * A host service → the Fleet Console it pins, on its machine admin's word (`site schedule move --at`): a one-time code
   * that moves this machine's site, at that time or as soon as the new machine is confirmed when `at` is null. With
   * `target: 'hq'` (`hq schedule move --at`), it moves hq and its default site, to answer at `hqAddress` when given.
   */
  | { kind: 'moveCodeAsk'; askId: string; at: string | null; target?: 'hq'; hqAddress?: string }
  /** The Fleet Console's answer: the code, sealed, so hq never sees it; or why there is none. */
  | { kind: 'moveCode'; replyTo: string; code: string | null; expiresAt: string | null; problem: string | null }
  /**
   * The Fleet Console → the machine it armed to receive a move, when the move ended before the old machine began it
   * (refused there, cancelled, or the other machine gone): why, so that machine stops waiting and says so.
   */
  | { kind: 'moveEnded'; transferId: string; reason: string }
  /**
   * A host service → the Fleet Console it pins, at its stop signal (stopping.ts): it stops on purpose. Changes only how
   * the machine's card reads, never what may be done to it.
   */
  | HostStoppingMessage

/** Anything an envelope may carry: a Fleet Console's and a machine's messages, and the Cloud controller's. */
export type SealedMessage = HostMessage | CloudControllerMessage

export type HandoverCodeAnswer = { ok: true; code: string; expiresAt: string } | { ok: false; problem: string }

export type EnvelopeRefusal =
  | 'malformed'
  | 'unsupported_version'
  | 'wrong_recipient'
  | 'unknown_sender'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'lifetime_too_long'
  /** Sent before the recipient's replay memory began (a restart), so it cannot be told from a replay. */
  | 'stale'
  | 'replayed'
  | 'undecryptable'
  | 'too_large'

const FINGERPRINT = /^[0-9a-f]{64}$/

export function isFingerprint(v: unknown): v is string {
  return typeof v === 'string' && FINGERPRINT.test(v)
}

/**
 * A fingerprint as the screens and the CLI show it, to be compared by eye: its first 64 bits in four groups of four
 * hex digits, as the boards draw it (`5F2A 9C1E 77B0 D4E3`). Pinning always uses the full fingerprint; the short form
 * is only what two people read to each other.
 */
export function formatFingerprint(fingerprint: string): string {
  if (!isFingerprint(fingerprint)) throw new Error('Not a fingerprint')
  return fingerprint.slice(0, 16).toUpperCase().match(/.{4}/g)!.join(' ')
}

const B64URL = /^[A-Za-z0-9_-]+$/

/** The envelope's shape, checked before any cryptography touches it; null when it is not one. */
export function parseHostEnvelope(data: unknown): HostEnvelope | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const b64 = (k: string, max: number): string | null =>
    typeof d[k] === 'string' && (d[k] as string).length <= max && B64URL.test(d[k] as string) ? (d[k] as string) : null
  const ms = (k: string): number | null =>
    typeof d[k] === 'number' && Number.isSafeInteger(d[k]) && (d[k] as number) > 0 ? (d[k] as number) : null
  if (d.v !== HOST_ENVELOPE_VERSION || !isFingerprint(d.from) || !isFingerprint(d.to)) return null
  const id = b64('id', 32)
  const epk = b64('epk', 64)
  const iv = b64('iv', 32)
  const sig = b64('sig', 128)
  const ct = b64('ct', Math.ceil(((HOST_ENVELOPE_MAX_BODY_BYTES + 16) * 4) / 3) + 4)
  const sentAt = ms('sentAt')
  const expiresAt = ms('expiresAt')
  if (!id || !epk || !iv || !sig || !ct || sentAt === null || expiresAt === null) return null
  return { v: HOST_ENVELOPE_VERSION, from: d.from, to: d.to, id, sentAt, expiresAt, epk, iv, ct, sig }
}
