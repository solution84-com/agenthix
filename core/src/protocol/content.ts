/**
 * The content transport (ADR-0063): a second connection a site dials, beside
 * the control channel, that carries bytes rather than typed events. hq opens a
 * named stream on it and the site serves it; either end then sends data until
 * it ends its half.
 *
 * Platform-neutral on purpose — `ui` imports runtime values from this package,
 * so nothing here may reach for `node:*`, `ws` or `Buffer`.
 */

import type { SiteContentMethodName, SiteContentParams } from './siteMethods.js'

export const HQ_SITE_CONTENT_PATH = '/hq-content'

/**
 * The most payload one WebSocket message carries. Liveness is a `ws` protocol
 * ping, and a pong cannot be answered from inside a message still arriving —
 * so a bounded message is what keeps a large transfer from starving it.
 */
export const MAX_CHUNK_BYTES = 64 * 1024

/**
 * The most one whole WebSocket message may be on a content line or a relay line: a chunk and its stream id, with room
 * to spare. Every server that listens on one, and every end that dials one, sets its `maxPayload` to this, so a
 * message is cut off before it is held whole rather than at the library's 100 MiB.
 */
export const CONTENT_LINK_MAX_MESSAGE_BYTES = MAX_CHUNK_BYTES + 64 * 1024

/** The most one stream buffers before its reader consumes it; beyond this it fails rather than grows. */
export const MAX_STREAM_BUFFER_BYTES = 16 * 1024 * 1024

/**
 * Flow control per stream, as HTTP/2 has it. An opener that reads more slowly than the line may open a stream with a
 * window: the bytes the server may send on it before it waits. The opener then grants more with `credit` frames as
 * its own reader takes what arrived, so a slow reader slows only its own stream; the shared socket is never paused.
 * A stream opened without a window is unlimited, as streams were before windows existed.
 *
 * 2 MiB keeps a stream near 15 MiB/s across a 130 ms round trip while bounding what one stream can make its reader
 * hold; a credit is sent once a quarter of a megabyte is owed, about eight frames per window, small beside the bytes
 * and always well under the window, so credit held back for batching never leaves a writer waiting.
 */
export const STREAM_INITIAL_WINDOW_BYTES = 2 * 1024 * 1024
export const STREAM_CREDIT_STEP_BYTES = 256 * 1024
/** The largest a window may grow, HTTP/2's own bound; a credit carrying it past this is a protocol error. */
export const MAX_STREAM_WINDOW_BYTES = 2 ** 31 - 1

/**
 * Since site protocol 1.12, a stream may be opened `duplex`: the opener's own bytes are flow-controlled too, for a
 * stream whose opener sends as much as it reads (a live app's request bodies and WebSocket messages, a bundle's write).
 * Each end then starts able to send `STREAM_INITIAL_WINDOW_BYTES` toward the other, and each grants more with `credit`
 * as its reader takes what arrived. The server holds what the opener sends before it accepts, which the window bounds.
 */
export const DUPLEX_INITIAL_WINDOW_BYTES = STREAM_INITIAL_WINDOW_BYTES

/** How long a site has to accept a stream hq opened. Matches the control channel's request timeout. */
export const CONTENT_OPEN_TIMEOUT_MS = 15_000

export const CONTENT_PING_INTERVAL_MS = 30_000

const ERROR_CODES = [
  'offline', 'unknown_method', 'handler_failed', 'cancelled',
  'disconnected', 'buffer_exceeded', 'timeout', 'protocol',
] as const
export type ContentErrorCode = (typeof ERROR_CODES)[number]

/** What an `open` frame names: one of `SiteContentMethods`, with that stream's params. */
export type ContentOpen = {
  [M in SiteContentMethodName]: { method: M; params: SiteContentParams<M> }
}[SiteContentMethodName]

export type ContentControlFrame =
  | ({ t: 'open'; id: number; window?: number; duplex?: true } & ContentOpen)
  | { t: 'accept'; id: number }
  | { t: 'end'; id: number }
  | { t: 'error'; id: number; code: ContentErrorCode; message: string }
  | { t: 'cancel'; id: number }
  | { t: 'credit'; id: number; bytes: number }

/**
 * A frame as the transport handles it, before a side reads it: an `open` names a method the server has still to look
 * up (and refuses with `unknown_method` when it serves none by that name) and params its handler has still to
 * check. The stream machine (contentMux.ts) carries any name; hq's opener is typed by `ContentOpen`.
 */
type TransportControlFrame =
  | Exclude<ContentControlFrame, { t: 'open' }>
  | { t: 'open'; id: number; method: string; params: unknown; window?: number; duplex?: true }

const MAX_STREAM_ID = 2 ** 32 - 1
const ID_BYTES = 4

function isWindowSize(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= MAX_STREAM_WINDOW_BYTES
}

function isStreamId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STREAM_ID
}

export function encodeControlFrame(frame: TransportControlFrame): string {
  return JSON.stringify(frame)
}

/**
 * Null for anything that is not exactly one of the frames — never a partial guess. A peer that predates a frame type
 * gets null for it and drops it, which is what keeps an added frame compatible.
 */
export function parseControlFrame(text: string): TransportControlFrame | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const f = value as Record<string, unknown>
  if (!isStreamId(f.id)) return null

  switch (f.t) {
    case 'open': {
      if (typeof f.method !== 'string' || f.method.length === 0) return null
      if (f.window !== undefined && !isWindowSize(f.window, 0)) return null
      if (f.duplex !== undefined && f.duplex !== true) return null
      return {
        t: 'open', id: f.id, method: f.method, params: f.params,
        ...(f.window === undefined ? {} : { window: f.window }), ...(f.duplex ? { duplex: true as const } : {}),
      }
    }
    case 'credit':
      return isWindowSize(f.bytes, 1) ? { t: 'credit', id: f.id, bytes: f.bytes } : null
    case 'accept':
    case 'end':
    case 'cancel':
      return { t: f.t, id: f.id }
    case 'error':
      return typeof f.message === 'string' && (ERROR_CODES as readonly string[]).includes(f.code as string)
        ? { t: 'error', id: f.id, code: f.code as ContentErrorCode, message: f.message }
        : null
    default:
      return null
  }
}

/** `[4-byte big-endian stream id][payload]`. */
export function encodeDataFrame(id: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_CHUNK_BYTES) {
    throw new Error(`A data frame carries at most ${MAX_CHUNK_BYTES} bytes; chunk the payload first`)
  }
  const frame = new Uint8Array(ID_BYTES + payload.length)
  new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(0, id, false)
  frame.set(payload, ID_BYTES)
  return frame
}

export function decodeDataFrame(frame: Uint8Array): { id: number; payload: Uint8Array } | null {
  if (frame.length < ID_BYTES) return null
  // byteOffset matters: a received frame is often a view into a larger buffer.
  const id = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false)
  return { id, payload: frame.subarray(ID_BYTES) }
}

export function chunkPayload(payload: Uint8Array, max: number = MAX_CHUNK_BYTES): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < payload.length; offset += max) {
    chunks.push(payload.subarray(offset, Math.min(offset + max, payload.length)))
  }
  return chunks
}
