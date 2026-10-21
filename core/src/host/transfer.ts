/**
 * A site moving to a new machine (host-management spec §13 *A site moves*): the old machine's host service passes
 * the move's sealed backup straight to the new one, through hq's relay, which can drop it but cannot read or alter
 * it. Envelopes carry at most 1 MB, so the backup travels in chunks:
 *
 * - **The backup is already sealed to the new machine.** The old machine takes the final backup sealed to its own key
 *   and re-wraps its file key to the new machine's sealing key; its chunks are AES-GCM in the STREAM construction, so
 *   none can be dropped, reordered, repeated or cut off at the end unnoticed, and hq cannot read them.
 * - **Each chunk is signed** by the old machine's Ed25519 key, over the transfer, both fingerprints, its place and
 *   whether it is the last, and the hash of its bytes. The new machine checks each against the identity the Fleet
 *   Console named in its signed `move` request, so hq can neither alter a chunk nor stand in a backup of its own sealed
 *   to the new machine's public key — the seal alone would not stop that.
 * - **The steps around it travel as envelopes** (`HostMessage` kind `transfer`), signed and sealed between the two
 *   host services, since one of them carries the site's credential.
 *
 * hq lets chunks pass only between the two machines the Fleet Console opened the transfer for (`transfer.open`), and
 * drops the transfer when it grows past `HOST_TRANSFER_MAX_BYTES`, goes faster than
 * `HOST_TRANSFER_MAX_BYTES_PER_SECOND`, falls silent, or either end leaves.
 */
import { parseScheduledChangeNotice, type ScheduledChange } from './scheduledChange.js'

/** The bytes of the sealed backup one chunk carries; base64url of this, with its frame, stays under the relay's limit. */
export const HOST_TRANSFER_CHUNK_BYTES = 512 * 1024

/** The most one transfer may carry: hq drops it beyond this. */
export const HOST_TRANSFER_MAX_BYTES = 256 * 1024 ** 3

/** hq's ceiling on a transfer's pace; a sender keeps below it. Bursts of `HOST_TRANSFER_WINDOW` chunks are allowed. */
export const HOST_TRANSFER_MAX_BYTES_PER_SECOND = 32 * 1024 * 1024

/** Chunks a sender has out before the receiver's acknowledgement of the first of them. */
export const HOST_TRANSFER_WINDOW = 8

/** Nothing passed for this long, after it started: hq drops the transfer, and each end gives up. */
export const HOST_TRANSFER_IDLE_MS = 3 * 60_000

/** How long a transfer may stay open in hq before it starts: a move scheduled further ahead is opened again. */
export const HOST_TRANSFER_MAX_OPEN_MS = 31 * 24 * 60 * 60_000

export type TransferChunk = {
  transferId: string
  /** From 0, one after another. */
  seq: number
  last: boolean
  /** The chunk's bytes, base64url. */
  data: string
  /** Ed25519 by the sending machine, base64url (`signTransferChunk`). */
  sig: string
}

/** Why hq dropped a transfer. */
export type TransferClosedReason = 'peer_left' | 'too_large' | 'too_fast' | 'idle' | 'expired' | 'closed' | 'not_allowed'

/**
 * The steps of a move between the two host services, sealed and signed (`HostMessage` kind `transfer`). In order:
 * the new machine has the backup restored and stopped (`ready`, with `restoring` while it works); the old machine,
 * whose site has been stopped since the final backup began, hands over the site's credential (`released`); the new
 * machine starts the site and, once it answers hq, says so (`tookOver`); the old machine commits to never starting
 * it again (`committed`), and only then does the new machine keep it running. Either side may end the move before
 * the commit (`failed`, `gaveBack`, `abort`), and the old machine then starts its site again.
 */
export type TransferStep =
  | { step: 'restoring' }
  | { step: 'ready' }
  | { step: 'failed'; reason: string }
  | {
      step: 'released'
      /** The site's credential, which exists only here and on the two machines. */
      credential: string
      /** The scheduled change on the old machine, so the new machine's site can tell hq it completed. */
      change: ScheduledChange
      /** How long the new machine has, from receiving this, to see the site answer hq and hear `committed`. */
      takeoverMs: number
    }
  | { step: 'tookOver' }
  | { step: 'committed' }
  | { step: 'gaveBack'; reason: string }
  | { step: 'abort'; reason: string }

/** How a move went, as each host service tells its Fleet Console (`HostMessage` kind `move`). */
export type MoveState =
  /** Old machine: the final backup is being taken, the site stopped. */
  | 'started'
  | 'transferring'
  /** New machine: the backup arrived and is being restored. */
  | 'restoring'
  /** New machine: the site runs here and answers hq; the old machine committed. */
  | 'tookOver'
  /** Old machine: the site runs on the new machine, and this one will not start it again. */
  | 'committed'
  /** Old machine: the move did not complete, and the site runs here again. */
  | 'rolledBack'
  /** New machine: the move did not complete; nothing of the site runs here. */
  | 'failed'
  /** Old machine: the copy it kept was removed, once the site answered from the new machine. */
  | 'removed'

export type MoveReport = { transferId: string; state: MoveState; reason: string | null }

const ID = /^[A-Za-z0-9_-]{8,64}$/
const B64URL = /^[A-Za-z0-9_-]*$/
const SIG = /^[A-Za-z0-9_-]{86}$/

export function isTransferId(v: unknown): v is string {
  return typeof v === 'string' && ID.test(v)
}

/** A chunk's shape, before its signature is checked; null when it is not one. */
export function parseTransferChunk(v: unknown): TransferChunk | null {
  const c = v as Partial<TransferChunk> | null
  if (!c || typeof c !== 'object' || Array.isArray(c) || !isTransferId(c.transferId)) return null
  if (typeof c.seq !== 'number' || !Number.isSafeInteger(c.seq) || c.seq < 0 || typeof c.last !== 'boolean') return null
  const maxChars = Math.ceil((HOST_TRANSFER_CHUNK_BYTES * 4) / 3)
  if (typeof c.data !== 'string' || c.data.length > maxChars || !B64URL.test(c.data)) return null
  if (typeof c.sig !== 'string' || !SIG.test(c.sig)) return null
  return { transferId: c.transferId, seq: c.seq, last: c.last, data: c.data, sig: c.sig }
}

const TEXT = /^[^\u0000-\u001f\u007f]{1,500}$/

/** A transfer step as it came out of an envelope; null when it is not one. */
export function parseTransferStep(v: unknown): TransferStep | null {
  const s = v as Record<string, unknown> | null
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null
  const reason = typeof s.reason === 'string' && TEXT.test(s.reason) ? s.reason : null
  switch (s.step) {
    case 'restoring':
    case 'ready':
    case 'tookOver':
    case 'committed':
      return { step: s.step }
    case 'failed':
    case 'gaveBack':
    case 'abort':
      return reason ? { step: s.step, reason } : null
    case 'released': {
      const credential = typeof s.credential === 'string' && /^[0-9a-f]{64}$/.test(s.credential) ? s.credential : null
      const takeoverMs = typeof s.takeoverMs === 'number' && Number.isSafeInteger(s.takeoverMs) && s.takeoverMs > 0 && s.takeoverMs <= 3600_000
        ? s.takeoverMs : null
      const change = parseScheduledChangeNotice({ update: 'completed', change: s.change, sentAt: new Date(0).toISOString(), reason: null })?.change ?? null
      return credential && takeoverMs && change ? { step: 'released', credential, change, takeoverMs } : null
    }
    default:
      return null
  }
}
