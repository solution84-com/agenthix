/**
 * The model relay's rules for what it passes on (spec §6): which path it may
 * append to a provider's upstream, and which headers cross in each direction.
 * Pure functions, so each rule is tested on its own.
 */
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import { CLOUD_BILLING_PROFILE_HEADER, CLOUD_CALL_ID_HEADER } from '@agenthix/core'
import { RELAY_TOKEN_HEADER } from './relayProviders'

/** Never passed upstream: every credential a harness could send, what only the relay may say, and what only describes the hop to the site. */
const REQUEST_DROPPED = new Set([
  'authorization', 'x-api-key', 'x-goog-api-key', 'api-key', RELAY_TOKEN_HEADER, 'proxy-authorization', 'cookie',
  // Only the relay names a call and its billing profile to Agenthix Cloud.
  CLOUD_CALL_ID_HEADER.toLowerCase(), CLOUD_BILLING_PROFILE_HEADER.toLowerCase(),
  'host', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip',
])

/** Hop-by-hop headers (RFC 9110 §7.6.1), which describe one connection and are never forwarded either way. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

/** Headers a `Connection` header names are hop-by-hop too. */
function connectionNamed(headers: IncomingHttpHeaders): Set<string> {
  const value = headers.connection
  return new Set((Array.isArray(value) ? value.join(',') : value ?? '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean))
}

/**
 * The path and query below the provider's relay address, from the request's
 * own URL, or null when it could reach outside the upstream's base: a `.` or
 * `..` segment, written plainly or percent-encoded, an encoded `/` or `\`, a
 * backslash, or anything that is not a path.
 */
export function relayedPath(url: string, prefix: string): { path: string; query: string } | null {
  if (!url.startsWith(prefix)) return null
  const rest = url.slice(prefix.length)
  const q = rest.indexOf('?')
  const path = q === -1 ? rest : rest.slice(0, q)
  const query = q === -1 ? '' : rest.slice(q)
  if (path !== '' && !path.startsWith('/')) return null
  if (/[\\#]|%2f|%5c|%00/i.test(path)) return null
  for (const segment of path.split('/')) {
    let decoded: string
    try { decoded = decodeURIComponent(segment) } catch { return null }
    if (decoded === '.' || decoded === '..') return null
  }
  return { path, query }
}

/** The upstream URL for a relayed path, or null when joining them left the upstream's origin or base path. */
export function upstreamUrl(base: string, relayed: { path: string; query: string }): URL | null {
  const baseUrl = new URL(base)
  const url = new URL(base + relayed.path + relayed.query)
  const basePath = baseUrl.pathname.replace(/\/+$/, '')
  if (url.origin !== baseUrl.origin) return null
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null
  return url
}

/** The request's headers as the provider receives them: no credential from the container, the turn's key in the provider's own header. */
export function upstreamRequestHeaders(incoming: IncomingHttpHeaders, keyHeaders: Record<string, string>): OutgoingHttpHeaders {
  const named = connectionNamed(incoming)
  const out: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || REQUEST_DROPPED.has(name) || HOP_BY_HOP.has(name) || named.has(name)) continue
    out[name] = value
  }
  return { ...out, ...keyHeaders }
}

/** The provider's response headers as the harness receives them: all but hop-by-hop ones, `retry-after` and rate-limit headers included. */
export function downstreamResponseHeaders(incoming: IncomingHttpHeaders): OutgoingHttpHeaders {
  const named = connectionNamed(incoming)
  const out: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || HOP_BY_HOP.has(name) || named.has(name)) continue
    out[name] = value
  }
  return out
}

/** The relay token a request carries: the plugin's own header, or — from Claude Code, which sends what `apiKeyHelper` printed as its key — `x-api-key` or a bearer. */
export function relayTokenOf(headers: IncomingHttpHeaders): string {
  const own = headers[RELAY_TOKEN_HEADER]
  if (typeof own === 'string' && own) return own
  const apiKey = headers['x-api-key']
  if (typeof apiKey === 'string' && apiKey) return apiKey
  const auth = headers.authorization
  return auth?.startsWith('Bearer ') ? auth.slice(7) : ''
}

const MODEL_SNIFF_BYTES = 16 * 1024

/**
 * Reads the requested model from the start of a JSON request body as it
 * passes, for the log line, without holding the body: `model` leads every
 * provider SDK's request. Google names it in the path instead.
 */
export class ModelSniffer {
  private seen = ''
  model: string | null = null

  constructor(path: string) {
    const google = /\/models\/([^/:]+)/.exec(path)
    if (google) this.model = decodeURIComponent(google[1])
  }

  push(chunk: Buffer): void {
    if (this.model !== null || this.seen.length >= MODEL_SNIFF_BYTES) return
    this.seen += chunk.toString('utf8', 0, Math.min(chunk.length, MODEL_SNIFF_BYTES - this.seen.length))
    const m = /"model"\s*:\s*"([^"\\]{1,200})"/.exec(this.seen)
    if (m) this.model = m[1]
  }
}
