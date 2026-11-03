/**
 * The address hq sees a host link's connection from (core's `HqSeenFromFrame`), read as Express reads `req.ip` with
 * `trust proxy` set to hq's count of trusted proxies (ADR-0067): the connection's own address, then X-Forwarded-For
 * from its right, one hop back per trusted proxy. Null when what is found is not an IP address.
 */
import net from 'node:net'
import type { IncomingMessage } from 'node:http'

export function seenFromAddress(req: Pick<IncomingMessage, 'headers' | 'socket'>, trustedProxies: number): string | null {
  const raw = req.headers['x-forwarded-for']
  const forwarded = (Array.isArray(raw) ? raw.join(',') : raw ?? '').split(',').map(a => a.trim()).filter(Boolean)
  const hops = [req.socket.remoteAddress ?? '', ...forwarded.reverse()]
  const address = hops[Math.min(trustedProxies, hops.length - 1)]!.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')
  return net.isIP(address) ? address : null
}
