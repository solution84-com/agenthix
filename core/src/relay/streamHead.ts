/**
 * The head of a site's answer on a `files.serve` stream. A content stream carries bytes only, so the site's answer
 * starts with a head: four bytes, big-endian, giving the length of a UTF-8 JSON object, then that object, then the
 * file's bytes (none for a refusal or a `headOnly` request). The relay turns the head into the HTTP status and headers
 * it answers the browser with.
 *
 * Platform-neutral: no `Buffer`, no `node:*`.
 */
import { fromUtf8, utf8 } from '../host/crypto/webCrypto.js'
import type { ByteRange } from './byteRange.js'
import { isTicketPurpose, type TicketPurpose } from './tokens.js'

/** Far beyond any head (a file name is at most a few hundred bytes); a larger length is refused before it is read. */
export const MAX_STREAM_HEAD_BYTES = 16 * 1024
const LENGTH_BYTES = 4

/**
 * Why a site would not serve a ticket, each with the status the relay answers:
 * - `ticket-invalid` (403): refused by `verifyRelayToken` for any reason but expiry;
 * - `ticket-expired` (403): past its life; the page asks hq for a new one;
 * - `changed` (409): the file's version is no longer the ticket's;
 * - `not-found` (404): no such file in the place, or a path that leads out of it (never said which);
 * - `range-not-satisfiable` (416);
 * - `busy` (503): the site's reads are full and the queue too;
 * - `failed` (500): anything else; the detail stays in the site's log.
 */
export const FILE_SERVE_REFUSALS = {
  'ticket-invalid': 403,
  'ticket-expired': 403,
  changed: 409,
  'not-found': 404,
  'range-not-satisfiable': 416,
  busy: 503,
  failed: 500,
} as const
export type FileServeRefusal = keyof typeof FILE_SERVE_REFUSALS

export type FileServeHead =
  | {
    status: 200 | 206
    /** The whole file's size, in bytes. */
    size: number
    /** Present exactly when the status is 206: the bytes that follow. */
    range?: ByteRange
    /** A guess from the name (`contentTypeForName`); the relay decides what it sends. */
    contentType: string
    purpose: TicketPurpose
    /** The file's name, for `Content-Disposition`. */
    fileName: string
  }
  | { status: (typeof FILE_SERVE_REFUSALS)[FileServeRefusal]; refusal: FileServeRefusal; size?: number }

export function refusalHead(refusal: FileServeRefusal, size?: number): FileServeHead {
  return { status: FILE_SERVE_REFUSALS[refusal], refusal, ...(size === undefined ? {} : { size }) }
}

/** The bytes a site writes first on the stream. Throws for a head that would not decode. */
export function encodeStreamHead(head: FileServeHead): Uint8Array {
  if (!isFileServeHead(head)) throw new Error('Not a valid stream head')
  return encodeJsonHead(head)
}

/**
 * Any head in this framing: four bytes, big-endian, giving the length of a UTF-8 JSON object, then the object. Used
 * by every stream on a relay line whose answer starts with a head (a live app's, a copy's).
 */
export function encodeJsonHead(head: object): Uint8Array {
  const json = utf8(JSON.stringify(head))
  if (json.length > MAX_STREAM_HEAD_BYTES) throw new Error('The stream head is too large')
  const out = new Uint8Array(LENGTH_BYTES + json.length)
  new DataView(out.buffer).setUint32(0, json.length)
  out.set(json, LENGTH_BYTES)
  return out
}

const size = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0

export function isFileServeHead(v: unknown): v is FileServeHead {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const h = v as Record<string, unknown>
  if (typeof h.refusal === 'string') {
    const status = (FILE_SERVE_REFUSALS as Record<string, number>)[h.refusal]
    return status !== undefined && h.status === status && (h.size === undefined || size(h.size))
  }
  if ((h.status !== 200 && h.status !== 206) || !size(h.size)) return false
  if (typeof h.contentType !== 'string' || typeof h.fileName !== 'string' || !isTicketPurpose(h.purpose)) return false
  if (h.status === 200) return h.range === undefined
  const r = h.range as Record<string, unknown> | undefined
  return !!r && size(r.start) && size(r.end) && (r.start as number) <= (r.end as number) && (r.end as number) < h.size
}

export type JsonHeadRead<H> =
  | { state: 'need-more' }
  | { state: 'head'; head: H; rest: Uint8Array }
  | { state: 'invalid'; reason: string }

export type StreamHeadRead = JsonHeadRead<FileServeHead>

/**
 * Reads the head from chunks as they arrive, however the stream split them. Once it has answered `head` (with any
 * bytes after the head as `rest`) or `invalid`, it is done: the caller handles the rest of the stream itself.
 */
export function createStreamHeadReader(): { push(chunk: Uint8Array): StreamHeadRead } {
  return createJsonHeadReader(isFileServeHead)
}

/** `createStreamHeadReader` for any head, which `isHead` checks whole. */
export function createJsonHeadReader<H>(isHead: (v: unknown) => v is H): { push(chunk: Uint8Array): JsonHeadRead<H> } {
  let held = new Uint8Array(0)
  let done = false
  return {
    push(chunk) {
      if (done) return { state: 'invalid', reason: 'the head was already read' }
      const joined = new Uint8Array(held.length + chunk.length)
      joined.set(held)
      joined.set(chunk, held.length)
      held = joined
      if (held.length < LENGTH_BYTES) return { state: 'need-more' }
      const length = new DataView(held.buffer, held.byteOffset).getUint32(0)
      if (length === 0 || length > MAX_STREAM_HEAD_BYTES) {
        done = true
        return { state: 'invalid', reason: 'the head\'s length is out of bounds' }
      }
      if (held.length < LENGTH_BYTES + length) return { state: 'need-more' }
      done = true
      let head: unknown
      try {
        head = JSON.parse(fromUtf8(held.subarray(LENGTH_BYTES, LENGTH_BYTES + length)))
      } catch {
        return { state: 'invalid', reason: 'the head is not JSON' }
      }
      if (!isHead(head)) return { state: 'invalid', reason: 'the head is not a valid head' }
      return { state: 'head', head, rest: held.slice(LENGTH_BYTES + length) }
    },
  }
}
