import { WebSocketServer, type WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import {
  RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, CONTENT_PING_INTERVAL_MS,
  checkProtocolCompatibility, protocolRefusalMessage, type RelayLinkWelcome,
} from '@agenthix/core'
import { refuseUpgrade } from '../sites/siteUpgrade'
import { readRelayReport, type RelayLoad } from './relayReport'
import { Logger } from '../server/utils/logger'

const logger = new Logger('RelayLink')

/** A report names every site holding a line; a megabyte is far beyond any fleet's and well short of harm. */
const MAX_FRAME_BYTES = 1024 * 1024

export type RelayLinkDeps = {
  /** The relay whose credential this is, or null. Timing-safe; never logs the secret. */
  authenticate(secret: string): Promise<{ relayId: string } | null>
  recordSeen(relayId: string): Promise<void>
  recordReport(relayId: string, load: RelayLoad): Promise<void>
}

/** One live link per relay: a relay that dials again replaces its old link. */
export class RelayLinks {
  private readonly links = new Map<string, WebSocket>()

  add(relayId: string, ws: WebSocket): void {
    const previous = this.links.get(relayId)
    if (previous && previous !== ws) previous.close(4000, 'Replaced by a newer connection')
    this.links.set(relayId, ws)
  }

  remove(relayId: string, ws: WebSocket): void {
    if (this.links.get(relayId) === ws) this.links.delete(relayId)
  }

  isConnected(relayId: string): boolean {
    return this.links.has(relayId)
  }
}

/**
 * The relay's link to hq (adr-0153), at `RELAY_HQ_LINK_PATH`: the relay presents its secret as a bearer credential
 * and states the relay protocol version. Authentication runs before version negotiation, as a site's does
 * (siteUpgrade.ts), so an unauthenticated caller learns nothing about versions. hq greets an accepted relay with its
 * id (`relay.welcome`), and records when it was last seen and what it reports.
 */
export function attachRelayLink(server: HttpServer, deps: RelayLinkDeps, links: RelayLinks = new RelayLinks()): RelayLinks {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })
  const toldRefused = new Set<string>()

  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split('?')[0] !== RELAY_HQ_LINK_PATH) return // not ours
    // As in siteUpgrade.ts: a client that resets during the awaits below must not raise an unlistened 'error'.
    socket.on('error', () => {})
    void (async () => {
      const secret = bearerOf(req)
      if (!secret) return refuseUpgrade(socket, 401, 'Unauthorized')
      let relay: { relayId: string } | null
      try {
        relay = await deps.authenticate(secret)
      } catch (err) {
        logger.error('relay authentication failed', err)
        return refuseUpgrade(socket, 500, 'Internal Server Error')
      }
      if (!relay) return refuseUpgrade(socket, 401, 'Unauthorized')

      const presented = headerOf(req, RELAY_PROTOCOL_VERSION_HEADER.toLowerCase())
      const compatibility = checkProtocolCompatibility(RELAY_PROTOCOL_VERSION, presented)
      if (!compatibility.ok) {
        if (!toldRefused.has(`${relay.relayId} ${presented}`)) {
          toldRefused.add(`${relay.relayId} ${presented}`)
          logger.warn(`relay ${relay.relayId}: refused. ${protocolRefusalMessage(compatibility, { own: 'HQ', peer: 'the relay' })}`)
        }
        return refuseUpgrade(socket, 426, 'Upgrade Required', { [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION })
      }
      const speak = `${compatibility.speak.major}.${compatibility.speak.minor}`
      const relayId = relay.relayId
      wss.handleUpgrade(req, socket, head, ws => onConnection(ws, relayId, speak))
    })()
  })

  function onConnection(ws: WebSocket, relayId: string, version: string): void {
    links.add(relayId, ws)
    logger.info(`relay ${relayId} connected`)
    const welcome: RelayLinkWelcome = { type: 'relay.welcome', version, relayId }
    ws.send(JSON.stringify(welcome))
    void deps.recordSeen(relayId).catch(err => logger.error(`could not record relay ${relayId} as seen:`, err))

    let awaitingPong = false
    const heartbeat = setInterval(() => {
      if (awaitingPong) return ws.terminate()
      awaitingPong = true
      ws.ping()
    }, CONTENT_PING_INTERVAL_MS)
    heartbeat.unref?.()
    ws.on('pong', () => { awaitingPong = false })

    ws.on('message', (data, isBinary) => {
      // Nothing on the link is binary; a frame that is not a report is dropped, and its content is never logged.
      if (isBinary) return
      const load = readRelayReport(data.toString())
      if (!load) {
        logger.warn(`relay ${relayId}: dropped a frame that is not a report`)
        return
      }
      void deps.recordReport(relayId, load).catch(err => logger.error(`could not record relay ${relayId}'s report:`, err))
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      links.remove(relayId, ws)
    })
    ws.on('error', err => logger.warn(`relay ${relayId}:`, err.message))
  }

  return links
}

function headerOf(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function bearerOf(req: IncomingMessage): string {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return match ? match[1] : ''
}
