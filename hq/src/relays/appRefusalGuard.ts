/**
 * The guard's *relay refusals over a threshold*, on hq's side: a relay reports how often it refused
 * requests to each app since its last report (every `RELAY_REPORT_INTERVAL_MS`), and an app past the threshold is cut
 * off at every relay. A page that is merely stale (an entry run out, a live preview paused) gets a few refusals; this many in
 * one report is another page hammering the app.
 */
import type { AppRefusalCounts } from './relayReport'

/** Refusals of one app in one report that cut it off. Missing cookies and revoked entries are a stale page's, not counted. */
export const APP_REFUSAL_THRESHOLD = 100
const COUNTED = new Set(['cross-site', 'no-fetch-metadata', 'websocket-origin', 'navigation', 'entry-origin', 'framing', 'ticket'])

export function overRefusalThreshold(counts: AppRefusalCounts, threshold = APP_REFUSAL_THRESHOLD): string[] {
  const per = new Map<string, number>()
  for (const c of counts) if (COUNTED.has(c.refusal)) per.set(c.appId, (per.get(c.appId) ?? 0) + c.count)
  return [...per].filter(([, n]) => n >= threshold).map(([appId]) => appId)
}
