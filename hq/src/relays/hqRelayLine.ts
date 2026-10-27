import { RELAY_SITE_LINE_PATH } from '@agenthix/core'

const SCHEMES = new Set(['ws:', 'wss:', 'http:', 'https:'])

/** What hq logs at boot when `HQ_RELAY_LINE_URL` is set but is not an address a site could dial. */
export const BAD_RELAY_LINE_URL_MESSAGE =
  'HQ_RELAY_LINE_URL is ignored: it must be an absolute ws:, wss:, http: or https: address of HQ\'s relay line. ' +
  'Sites dial the line path on HQ\'s own address instead. Fix or remove it in HQ\'s environment, then restart.'

/**
 * Development only: where sites dial hq's relay when they cannot reach it through hq's own address (in dev they dial
 * hq-server, which has no `/relay-line`). Unset in production, where the path resolves against hq-web.
 */
export function hqRelayLineOverride(env: NodeJS.ProcessEnv = process.env): { url: string | null; invalid: boolean } {
  const raw = env.HQ_RELAY_LINE_URL?.trim()
  if (!raw) return { url: null, invalid: false }
  try {
    const url = new URL(raw)
    if (SCHEMES.has(url.protocol) && url.hostname) return { url: url.toString(), invalid: false }
  } catch {
    // falls through to invalid
  }
  return { url: null, invalid: true }
}

/** The line address hq gives sites for its own relay: the override when valid, else the path. */
export function hqRelayLine(env: NodeJS.ProcessEnv = process.env): string {
  return hqRelayLineOverride(env).url ?? RELAY_SITE_LINE_PATH
}
