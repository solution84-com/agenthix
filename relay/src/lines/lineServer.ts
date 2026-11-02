/**
 * Where a site dials its relay (`RELAY_SITE_LINE_PATH`). The site presents the pass hq gave it with `relay.assign`;
 * the relay keeps the line only when that pass is hq's, names this relay as its audience and the dialling site as
 * its subject, and is in date. A relay hq has not greeted yet does not know its own id, so it takes no line.
 *
 * Authentication runs before version negotiation, as on hq's site upgrade: a caller without a pass learns nothing
 * about versions. Liveness is a `ws` protocol ping, as on hq's content channel.
 */
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  CONTENT_PING_INTERVAL_MS, MAX_CHUNK_BYTES, RELAY_PASS_TOKEN_TYPE, RELAY_PROTOCOL_VERSION,
  RELAY_PROTOCOL_VERSION_HEADER, RELAY_SITE_ID_HEADER, RELAY_SITE_LINE_PATH, SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER, checkProtocolCompatibility, parseProtocolVersion, verifyRelayToken,
} from '@agenthix/core'
import type { KeySet } from '../keySet'
import type { Log } from '../log'
import type { SiteLines } from './siteLines'

/** `files.serve`, the first stream a relay opens, came in site protocol 1.8. */
const MIN_SITE_MINOR = 8

export type LineServerDeps = {
  lines: SiteLines
  keys: KeySet
  /** This relay's id, from hq's welcome; null until then. */
  relayId(): string | null
  log: Log
  now?: () => number
  pingIntervalMs?: number
  /** Takes an upgrade that is not a line (a live app's WebSocket); true when it did. */
  otherUpgrade?(req: IncomingMessage, socket: Duplex, head: Buffer): boolean
}

export function attachSiteLines(server: HttpServer, deps: LineServerDeps): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CHUNK_BYTES + 64 * 1024 })

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {})
    if (deps.otherUpgrade?.(req, socket, head)) return
    if ((req.url ?? '').split('?')[0] !== RELAY_SITE_LINE_PATH) {
      refuseUpgrade(socket, 404, 'Not Found')
      return
    }
    void (async () => {
      const siteId = await admit(req, socket, deps)
      if (!siteId) return
      wss.handleUpgrade(req, socket, head, ws => onLine(ws, siteId, deps))
    })()
  })
}

async function admit(req: IncomingMessage, socket: Duplex, deps: LineServerDeps): Promise<string | null> {
  const relayId = deps.relayId()
  if (!relayId) {
    refuseUpgrade(socket, 503, 'Service Unavailable')
    return null
  }
  const siteId = headerOf(req, RELAY_SITE_ID_HEADER)
  const pass = /^Bearer (.+)$/.exec(headerOf(req, 'authorization'))?.[1] ?? ''
  if (!siteId || !pass) {
    refuseUpgrade(socket, 401, 'Unauthorized')
    return null
  }
  let verdict
  try {
    const verify = (keys: Awaited<ReturnType<KeySet['current']>>) => verifyRelayToken(pass, {
      type: RELAY_PASS_TOKEN_TYPE, keys, audience: relayId, site: siteId, nowMs: (deps.now ?? Date.now)(),
    })
    verdict = await verify(await deps.keys.current())
    if (!verdict.ok && verdict.refusal === 'unknown-key') {
      const fresh = await deps.keys.refetch()
      if (fresh) verdict = await verify(fresh)
    }
  } catch (err) {
    deps.log(`could not fetch hq's key set to check a site's pass: ${err instanceof Error ? err.message : String(err)}`)
    refuseUpgrade(socket, 503, 'Service Unavailable')
    return null
  }
  if (!verdict.ok) {
    refuseUpgrade(socket, 401, 'Unauthorized')
    return null
  }

  const relay = checkProtocolCompatibility(RELAY_PROTOCOL_VERSION, headerOf(req, RELAY_PROTOCOL_VERSION_HEADER))
  const site = checkProtocolCompatibility(SITE_PROTOCOL_VERSION, headerOf(req, SITE_PROTOCOL_VERSION_HEADER))
  const minimum = parseProtocolVersion(SITE_PROTOCOL_VERSION)!
  const siteTooOld = site.ok && site.speak.major === minimum.major && site.speak.minor < MIN_SITE_MINOR
  if (!relay.ok || !site.ok || siteTooOld) {
    refuseUpgrade(socket, 426, 'Upgrade Required', {
      [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION,
      [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION,
    })
    return null
  }
  return siteId
}

function onLine(ws: WebSocket, siteId: string, deps: LineServerDeps): void {
  const mux = deps.lines.add(siteId, ws)
  let awaitingPong = false
  const heartbeat = setInterval(() => {
    if (awaitingPong) {
      ws.terminate()
      return
    }
    awaitingPong = true
    ws.ping()
  }, deps.pingIntervalMs ?? CONTENT_PING_INTERVAL_MS)
  heartbeat.unref?.()

  ws.on('pong', () => { awaitingPong = false })
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = data as Buffer
      mux.receiveBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    } else {
      mux.receiveText(data.toString())
    }
  })
  ws.on('close', () => {
    clearInterval(heartbeat)
    deps.lines.remove(siteId, ws)
  })
  // 'error' is always followed by 'close', which does the cleanup.
  ws.on('error', err => deps.log(`line from site ${siteId}: ${err.message}`))
}

/** A real HTTP answer before the socket is destroyed, so the site can log why. */
export function refuseUpgrade(socket: Duplex, code: number, reason: string, headers: Record<string, string> = {}): void {
  const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
  socket.write(`HTTP/1.1 ${code} ${reason}\r\n${extra}Connection: close\r\n\r\n`)
  socket.destroy()
}

function headerOf(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()]
  return ((Array.isArray(value) ? value[0] : value) ?? '').trim()
}
