import { HQ_SITE_CHANNEL_PATH, HQ_SITE_CONTENT_PATH } from '@agenthix/core'

/**
 * Rows written before hq started returning a path hold a bare origin. Dialling
 * that reaches socket.io's upgrade handler rather than the control channel, and
 * the only symptom on this side is a socket error. Normalise instead of
 * migrating — the stored value is still hq's to choose if it ever moves the
 * channel behind a proxy prefix.
 *
 * Returns null when the stored value cannot be parsed, so the caller logs a
 * cause instead of throwing out of a boot path.
 */
export function resolveChannelUrl(hqWsUrl: string): string | null {
  let url: URL
  try {
    url = new URL(hqWsUrl)
  } catch {
    return null
  }
  if (url.pathname === '' || url.pathname === '/') url.pathname = HQ_SITE_CHANNEL_PATH
  return url.toString()
}

/**
 * The content transport lives beside the control channel (ADR-0063). Derived
 * from the stored control-channel url so a proxy prefix hq chose is kept.
 */
export function resolveContentUrl(hqWsUrl: string): string | null {
  const control = resolveChannelUrl(hqWsUrl)
  if (!control) return null
  const url = new URL(control)
  url.pathname = url.pathname.replace(/[^/]*$/, HQ_SITE_CONTENT_PATH.slice(1))
  return url.toString()
}
