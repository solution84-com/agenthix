/**
 * A live app's traffic on a site's relay line (live preview spec section 4, *The app*). The relay
 * opens one `app.serve` stream, duplex (content.ts), for every HTTP request and every WebSocket a browser makes to an
 * app's address, once its own checks pass (relay/appDoor.ts). The site trusts nothing the relay says: on every stream
 * it verifies the app ticket itself (`verifyRelayToken`, its own id the audience, the line's relay the relay), redeems
 * the ticket's `siteTicket` on the ticket's first stream and accepts later streams of the same ticket only while its
 * live preview is running, and connects only to that app's port in that live preview's container.
 *
 * On the stream:
 * - **relay → site:** the request's body, if any, then the end of its half. For a WebSocket, after the site's head,
 *   the browser's messages, each framed by `encodeAppWsMessage`.
 * - **site → relay:** a head (`encodeAppResponseHead`, the framing of relay/streamHead.ts), then the answer's body and
 *   the end. For a WebSocket the head says `101` and names the subprotocol the app chose; the app's messages follow,
 *   framed the same way. Either end closes a WebSocket with a close message, then ends its half. Pings stay on each
 *   hop: the relay answers the browser's, the site the app's.
 *
 * Platform-neutral: no `Buffer`, no `node:*`.
 */
import { createJsonHeadReader, encodeJsonHead, type JsonHeadRead } from '../relay/streamHead.js'

export const APP_SERVE_METHOD = 'app.serve'

/**
 * Never carried to the app: the hop-by-hop headers, the browser's `Host` (the site addresses the app itself, and passes
 * the browser's as `X-Forwarded-Host`), and the relay's own cookies, which the relay removes from `Cookie` itself.
 */
export const APP_HOP_BY_HOP_HEADERS = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'host', 'sec-websocket-key', 'sec-websocket-accept', 'sec-websocket-extensions',
  'sec-websocket-version', 'http2-settings',
] as const

export type AppHeader = [name: string, value: string]

export type AppRequestHead = {
  /** An HTTP method, as the browser sent it. */
  method: string
  /** The path and query, as the browser sent them: always starting with `/`. */
  target: string
  /** In the order the browser sent them, names in lower case, without `APP_HOP_BY_HOP_HEADERS`. */
  headers: AppHeader[]
  /** Present for a WebSocket: the subprotocols the page offered. */
  websocket?: { protocols: string[] }
}

export type AppServeParams = {
  /** The app ticket behind the browser's cookie, untouched. Never logged. */
  ticket: string
  request: AppRequestHead
}

export const APP_MAX_HEADERS = 128
export const APP_MAX_TARGET_BYTES = 8 * 1024
/** A request head's headers together, names and values; beyond it the relay answers 431 itself. */
export const APP_MAX_HEADER_BYTES = 32 * 1024

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/
// Visible characters, spaces and tabs only: no CR, LF or NUL that could split a header in two.
const HEADER_VALUE = /^[\t\x20-\x7e\x80-￿]*$/
const HOP = new Set<string>(APP_HOP_BY_HOP_HEADERS)

function isHeaders(v: unknown, hopAllowed: boolean): v is AppHeader[] {
  if (!Array.isArray(v) || v.length > APP_MAX_HEADERS) return false
  let bytes = 0
  for (const h of v) {
    if (!Array.isArray(h) || h.length !== 2 || typeof h[0] !== 'string' || typeof h[1] !== 'string') return false
    if (!HEADER_NAME.test(h[0]) || !HEADER_VALUE.test(h[1]) || (!hopAllowed && HOP.has(h[0]))) return false
    bytes += h[0].length + h[1].length
  }
  return bytes <= APP_MAX_HEADER_BYTES
}

export function isAppRequestHead(v: unknown): v is AppRequestHead {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  if (typeof r.method !== 'string' || r.method.length > 32 || !TOKEN.test(r.method)) return false
  if (typeof r.target !== 'string' || !r.target.startsWith('/') || r.target.startsWith('//')
    || r.target.length > APP_MAX_TARGET_BYTES || !/^[\x21-\x7e]+$/.test(r.target)) return false
  if (!isHeaders(r.headers, false)) return false
  if (r.websocket === undefined) return true
  const ws = r.websocket as Record<string, unknown>
  return r.method === 'GET' && typeof ws === 'object' && ws !== null && Array.isArray(ws.protocols)
    && ws.protocols.length <= 16 && ws.protocols.every(p => typeof p === 'string' && TOKEN.test(p))
}

/**
 * Why the site would not carry a stream to the app, each with the status the relay answers:
 * - `ticket-invalid` (403): refused by `verifyRelayToken` for any reason but expiry, or its `siteTicket` not the
 *   site's for exactly this app and entry;
 * - `ticket-expired` (403): past its life; the page renews through hq;
 * - `ticket-used` (403): its `siteTicket` was redeemed by another ticket;
 * - `preview-not-running` (409): its live preview is starting, paused, stopped or not the ticket's;
 * - `app-starting` (503): it is starting; try again shortly;
 * - `app-not-running` (503): stopped, or failed; the agent or the person starts it;
 * - `app-unreachable` (502): nothing answered on its port;
 * - `busy` (503): the site carries as many app streams as it takes;
 * - `failed` (500): anything else; the detail stays in the site's log.
 */
export const APP_SERVE_REFUSALS = {
  'ticket-invalid': 403,
  'ticket-expired': 403,
  'ticket-used': 403,
  'preview-not-running': 409,
  'app-starting': 503,
  'app-not-running': 503,
  'app-unreachable': 502,
  busy: 503,
  failed: 500,
} as const
export type AppServeRefusal = keyof typeof APP_SERVE_REFUSALS

export type AppResponseHead =
  | {
    /** The app's own status; `101` exactly when the request was a WebSocket the app accepted. */
    status: number
    /** As the app sent them, names in lower case, hop-by-hop ones left out; the relay strips `Domain` from cookies. */
    headers: AppHeader[]
    /** Present exactly with `101`: the subprotocol the app chose, or null. */
    websocket?: { protocol: string | null }
  }
  | { refusal: AppServeRefusal; status: (typeof APP_SERVE_REFUSALS)[AppServeRefusal] }

export function appRefusalHead(refusal: AppServeRefusal): AppResponseHead {
  return { refusal, status: APP_SERVE_REFUSALS[refusal] }
}

export function isAppResponseHead(v: unknown): v is AppResponseHead {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const h = v as Record<string, unknown>
  if (typeof h.refusal === 'string') {
    const status = (APP_SERVE_REFUSALS as Record<string, number>)[h.refusal]
    return status !== undefined && h.status === status && Object.keys(h).length === 2
  }
  if (!Number.isInteger(h.status) || (h.status as number) < 101 || (h.status as number) > 599) return false
  if (!isHeaders(h.headers, false)) return false
  if (h.status !== 101) return h.websocket === undefined
  const ws = h.websocket as Record<string, unknown> | undefined
  return !!ws && typeof ws === 'object' && (ws.protocol === null || (typeof ws.protocol === 'string' && TOKEN.test(ws.protocol)))
}

export function encodeAppResponseHead(head: AppResponseHead): Uint8Array {
  if (!isAppResponseHead(head)) throw new Error('Not a valid app response head')
  return encodeJsonHead(head)
}

export function createAppResponseHeadReader(): { push(chunk: Uint8Array): JsonHeadRead<AppResponseHead> } {
  return createJsonHeadReader(isAppResponseHead)
}

/** A WebSocket message's kind, by RFC 6455's opcodes. */
export const APP_WS_KINDS = { text: 1, binary: 2, close: 8 } as const
export type AppWsKind = keyof typeof APP_WS_KINDS
export type AppWsMessage = { kind: AppWsKind; payload: Uint8Array }

/** The largest message carried either way; a larger one closes the WebSocket (1009, as RFC 6455 has it). */
export const APP_WS_MAX_MESSAGE_BYTES = 8 * 1024 * 1024
const WS_HEADER_BYTES = 5

/** `[kind: 1 byte][length: 4 bytes, big-endian][payload]`. A close's payload is RFC 6455's: a code, then a reason. */
export function encodeAppWsMessage(message: AppWsMessage): Uint8Array {
  const op = APP_WS_KINDS[message.kind]
  if (op === undefined) throw new Error('Not a WebSocket message kind')
  if (message.payload.length > APP_WS_MAX_MESSAGE_BYTES) throw new Error('The WebSocket message is too large')
  const out = new Uint8Array(WS_HEADER_BYTES + message.payload.length)
  const view = new DataView(out.buffer)
  view.setUint8(0, op)
  view.setUint32(1, message.payload.length)
  out.set(message.payload, WS_HEADER_BYTES)
  return out
}

const KIND_OF = new Map<number, AppWsKind>(Object.entries(APP_WS_KINDS).map(([k, v]) => [v, k as AppWsKind]))

/**
 * Reads messages from chunks as they arrive, however the stream split them. `invalid` is final: an unknown kind or a
 * message past `APP_WS_MAX_MESSAGE_BYTES`, which closes the WebSocket.
 */
export function createAppWsReader(): { push(chunk: Uint8Array): { messages: AppWsMessage[] } | { invalid: string } } {
  let held = new Uint8Array(0)
  let broken: string | null = null
  return {
    push(chunk) {
      if (broken) return { invalid: broken }
      const joined = new Uint8Array(held.length + chunk.length)
      joined.set(held)
      joined.set(chunk, held.length)
      held = joined
      const messages: AppWsMessage[] = []
      while (held.length >= WS_HEADER_BYTES) {
        const view = new DataView(held.buffer, held.byteOffset, held.byteLength)
        const kind = KIND_OF.get(view.getUint8(0))
        const length = view.getUint32(1)
        if (!kind) return { invalid: (broken = 'not a WebSocket message kind') }
        if (length > APP_WS_MAX_MESSAGE_BYTES) return { invalid: (broken = 'a WebSocket message too large') }
        if (held.length < WS_HEADER_BYTES + length) break
        messages.push({ kind, payload: held.slice(WS_HEADER_BYTES, WS_HEADER_BYTES + length) })
        held = held.slice(WS_HEADER_BYTES + length)
      }
      return { messages }
    },
  }
}
