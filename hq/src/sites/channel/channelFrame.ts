import type { HQConnectionMessage } from '@agenthix/core'

/**
 * One control-channel frame from a site, or null when it is not one: JSON holding an object whose `version`, `type`
 * and `siteId` are text and whose `requestId` and `replyTo`, when present, are text. The payload is left to the
 * message's own handler, which checks it.
 */
export function readChannelFrame(text: string): HQConnectionMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const f = value as Record<string, unknown>
  if (typeof f.version !== 'string' || typeof f.type !== 'string' || typeof f.siteId !== 'string') return null
  if (!optionalText(f.requestId) || !optionalText(f.replyTo)) return null
  return f as unknown as HQConnectionMessage
}

function optionalText(v: unknown): boolean {
  return v === undefined || typeof v === 'string'
}
