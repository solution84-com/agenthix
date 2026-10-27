// What a browser does with a relay link, and what a site does to hold its line, for the tests of hq's relay.
//
// A link names files.localhost on hq's web page's port, as hq gives it in development. Every browser resolves that
// name to this machine; Node does not everywhere, so a request is sent to localhost with the link's Host header,
// which is what the browser would send and what the relay checks.
import { request } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, RELAY_SITE_ID_HEADER, SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER,
} from '../../../core/dist/index.js'
import { hqDb } from './db'
import { HQ_ROOT, PORTS } from './env'
import { until } from './hqApi'

export type Answer = { status: number; headers: Record<string, string>; body: Buffer }

/** GET (or HEAD) `link` as a browser would, with its own Host header; the body whole. */
export function browserGet(link: string, headers: Record<string, string> = {}, method: 'GET' | 'HEAD' = 'GET'): Promise<Answer> {
  const url = new URL(link)
  return new Promise((resolve, reject) => {
    const req = request(
      { host: 'localhost', port: Number(url.port), path: url.pathname + url.search, method, headers: { Host: url.host, ...headers } },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () => {
          const flat: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) flat[k] = Array.isArray(v) ? v.join(', ') : v
          resolve({ status: res.statusCode ?? 0, headers: flat, body: Buffer.concat(chunks) })
        })
        res.on('error', reject)
      },
    )
    req.setTimeout(30_000, () => req.destroy(new Error(`no answer from ${url.host} within 30s`)))
    req.on('error', reject)
    req.end()
  })
}

/** hq's relay row, once hq has one and its relay holds a line from `siteId` (as the relay's last report said). */
export async function waitForRelayLine(siteId: string): Promise<{ id: string }> {
  return until(async () => {
    const relay = await hqDb.relay.findFirst({ where: { isHq: true, state: { not: 'REMOVED' } } })
    const sites = (relay?.load as { sites?: string[] } | null)?.sites ?? []
    return relay && sites.includes(siteId) ? relay : null
  }, `hq's relay to report a line from site ${siteId}`, 180_000)
}

type WsLike = {
  once(event: 'open', fn: () => void): void
  once(event: 'unexpected-response', fn: (req: unknown, res: { statusCode?: number }) => void): void
  on(event: 'error', fn: (err: Error) => void): void
  terminate(): void
  close(): void
}

const require = createRequire(import.meta.url)
// `ws` from hq's own node_modules, as relayLink.ts loads it: Node's WebSocket cannot send an Authorization header.
const WebSocket: new (url: string, options: { headers: Record<string, string> }) => WsLike = require(join(HQ_ROOT, 'node_modules/ws'))

/**
 * Dials hq's relay's line as a site would, presenting `pass` (or none) for `siteId`; answers the HTTP status the relay
 * refused it with, or 101 if it took the line (closed again at once).
 */
export function dialLine(siteId: string, pass: string | null): Promise<number> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORTS.relay}/relay-line`, {
    headers: {
      ...(pass ? { Authorization: `Bearer ${pass}` } : {}),
      [RELAY_SITE_ID_HEADER]: siteId,
      [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION,
      [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION,
    },
  })
  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      ws.close()
      resolve(101)
    })
    ws.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0)
      ws.terminate()
    })
    ws.on('error', err => reject(err))
  })
}
