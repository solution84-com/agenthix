/**
 * Frames on the host link and the console link (core's relay.ts), and the one place hq looks inside an envelope: its
 * header, to route it. hq never opens, verifies or rewrites one; it passes the fields it was given, each unchanged,
 * and refuses a frame too large to be an envelope.
 */
import type { WebSocket } from 'ws'
import {
  HOST_RELAY_MAX_FRAME_BYTES,
  HOST_PROTOCOL_VERSION,
  checkProtocolCompatibility,
  parseHostEnvelope,
  type HostEnvelope,
  type RelayFrame,
  type RelayUndeliverableReason,
} from '@agenthix/core'

/** A frame over this closes the link (ws `maxPayload`); between the relay limit and this, it is answered `too_large`. */
export const LINK_MAX_PAYLOAD_BYTES = HOST_RELAY_MAX_FRAME_BYTES * 4

/** Silence for two intervals terminates a link, as on the site channel. */
export const LINK_PING_INTERVAL_MS = 30_000

/** Whether a frame's version is one this hq talks to, by the rule every connection follows. */
export function speaksWith(version: unknown): boolean {
  return typeof version === 'string' && checkProtocolCompatibility(HOST_PROTOCOL_VERSION, version).ok
}

export function frame<T extends string, P>(type: T, payload: P, extra: { requestId?: string; replyTo?: string } = {}): RelayFrame<T, P> {
  return { version: HOST_PROTOCOL_VERSION, type, payload, ...extra }
}

export function send(ws: WebSocket, value: RelayFrame): boolean {
  if (ws.readyState !== ws.OPEN) return false
  ws.send(JSON.stringify(value))
  return true
}

/** A frame as it came off the wire, or null when it is not one. */
export function parseFrame(raw: string): RelayFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const f = value as Record<string, unknown>
  if (typeof f.type !== 'string' || !speaksWith(f.version)) return null
  return {
    version: f.version as string,
    type: f.type,
    payload: f.payload,
    ...(typeof f.requestId === 'string' ? { requestId: f.requestId } : {}),
    ...(typeof f.replyTo === 'string' ? { replyTo: f.replyTo } : {}),
  }
}

export type EnvelopeRead = { envelope: HostEnvelope } | { refused: { envelopeId: string; reason: RelayUndeliverableReason } }

const ENVELOPE_ID = /^[A-Za-z0-9_-]{1,32}$/

/**
 * The envelope a `relay.envelope` frame carries, checked for its shape only — the header fields and that the
 * ciphertext is base64url of no more than an envelope's body. `frameBytes` is the whole frame's size on the wire.
 */
export function readEnvelope(payload: unknown, frameBytes: number): EnvelopeRead {
  const raw = payload && typeof payload === 'object' ? (payload as { envelope?: unknown }).envelope : undefined
  const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined
  const envelopeId = typeof id === 'string' && ENVELOPE_ID.test(id) ? id : ''
  if (frameBytes > HOST_RELAY_MAX_FRAME_BYTES) return { refused: { envelopeId, reason: 'too_large' } }
  const envelope = parseHostEnvelope(raw)
  return envelope ? { envelope } : { refused: { envelopeId, reason: 'malformed' } }
}
