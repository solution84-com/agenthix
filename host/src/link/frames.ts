/** Frames on the host link (core's `HostLinkFrame`), versioned by the relay's own protocol and its compatibility rule. */
import { HOST_PROTOCOL_VERSION, checkProtocolCompatibility, type RelayFrame } from '@agenthix/core'

export function frame(type: string, payload: unknown, requestId?: string): string {
  const f: RelayFrame = { version: HOST_PROTOCOL_VERSION, type, payload }
  if (requestId) f.requestId = requestId
  return JSON.stringify(f)
}

/** A frame of a version this side talks to; null for anything else, which is dropped unread. */
export function parseFrame(text: string): { type: string; payload: Record<string, unknown> } | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  const f = value as Partial<RelayFrame> | null
  if (!f || typeof f !== 'object' || typeof f.type !== 'string' || typeof f.version !== 'string') return null
  if (!checkProtocolCompatibility(HOST_PROTOCOL_VERSION, f.version).ok) return null
  const payload = f.payload && typeof f.payload === 'object' && !Array.isArray(f.payload) ? (f.payload as Record<string, unknown>) : {}
  return { type: f.type, payload }
}
