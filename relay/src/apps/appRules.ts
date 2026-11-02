/**
 * Which browser requests to a live app the relay lets through (live preview spec section 6,
 * *Apps and the relay*), decided from the browser's fetch metadata and `Origin` alone, before any cookie is read. Live apps under one
 * preview domain are one site to a browser, so `same-site` is never enough: only the app's own origin passes.
 *
 * - The entry (`APP_ENTRY_PATH`): a `POST` navigation sent from hq's page (`Origin` hq's), framed or top level.
 * - A request without fetch metadata fails closed: every browser that can run hq sends it, but for a WebSocket.
 * - A WebSocket: opened by the app's own page only: `Origin` the app's, and same-origin where the browser says (Chromium
 *   sends no fetch metadata with a WebSocket's handshake).
 * - A navigation: the app's own (same-origin), or one made at the top level from outside any page (`none`: typed, a
 *   bookmark, but also a link opened from a mail or chat program). That one is sent to the app's `/` unless it is for
 *   `/` already, so a link from elsewhere never reaches a path or query of the app with the person's entry. A link or
 *   form from any other page, a sibling app's included, is refused.
 * - Anything else (scripts, styles, `fetch`, images, workers): same-origin only.
 */
import { APP_ENTRY_PATH, type RelayAppRefusal } from '@agenthix/core'

export type RequestFacts = {
  method: string
  /** The path without its query. */
  path: string
  /** Whether the request's target carries a query. */
  query: boolean
  websocket: boolean
  origin: string | undefined
  site: string | undefined
  mode: string | undefined
  dest: string | undefined
}

export type RuleVerdict = { pass: 'entry' | 'request' } | { refuse: RelayAppRefusal } | { toRoot: true }

const NAVIGATION_DESTS = new Set(['document', 'iframe', 'frame'])

export function judgeAppRequest(f: RequestFacts, appOrigin: string, hqOrigin: string | null): RuleVerdict {
  if (f.path === APP_ENTRY_PATH && !f.websocket) {
    if (f.method !== 'POST' || !hqOrigin || f.origin !== hqOrigin) return { refuse: 'entry-origin' }
    if (!f.site) return { refuse: 'no-fetch-metadata' }
    if (f.mode !== 'navigate' || !NAVIGATION_DESTS.has(f.dest ?? '')) return { refuse: 'navigation' }
    return { pass: 'entry' }
  }
  if (f.websocket) {
    // A browser's handshake always carries its page's Origin, which no page can set; Chromium sends no fetch metadata
    // with it, so where there is none the Origin decides alone.
    return f.origin === appOrigin && (f.site === undefined || f.site === 'same-origin') ? { pass: 'request' } : { refuse: 'websocket-origin' }
  }
  if (!f.site || !f.mode) return { refuse: 'no-fetch-metadata' }
  if (f.mode === 'navigate' || f.mode === 'nested-navigate') {
    if (f.site === 'same-origin') return { pass: 'request' }
    if (f.site === 'none' && f.dest === 'document' && (f.method === 'GET' || f.method === 'HEAD')) {
      return f.path === '/' && !f.query ? { pass: 'request' } : { toRoot: true }
    }
    return { refuse: 'navigation' }
  }
  return f.site === 'same-origin' ? { pass: 'request' } : { refuse: 'cross-site' }
}

function header(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v === undefined ? undefined : v.trim().toLowerCase()
}

export function requestFacts(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }, websocket: boolean,
): RequestFacts {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
  return {
    method: (req.method ?? 'GET').toUpperCase(),
    path: (req.url ?? '').split('?')[0],
    query: (req.url ?? '').includes('?'),
    websocket,
    origin: origin?.trim(),
    site: header(req.headers['sec-fetch-site']),
    mode: header(req.headers['sec-fetch-mode']),
    dest: header(req.headers['sec-fetch-dest']),
  }
}
