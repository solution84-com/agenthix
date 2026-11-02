import { WebSocketServer, type WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import {
  RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, CONTENT_PING_INTERVAL_MS,
  checkProtocolCompatibility, protocolRefusalMessage, type RelayAnswer, type RelayAsk, type RelayLinkFrame, type RelayLinkWelcome,
} from '@agenthix/core'
import { refuseUpgrade } from '../sites/siteUpgrade'
import { readAppRefusals, readRelayReportFrame, type AppRefusalCounts, type RelayLoad } from './relayReport'
import { Logger } from '../server/utils/logger'

const logger = new Logger('RelayLink')

/** A report names every site holding a line; a megabyte is far beyond any fleet's and well short of harm. */
const MAX_FRAME_BYTES = 1024 * 1024

export type RelayLinkDeps = {
  /** The relay whose credential this is, or null. Timing-safe; never logs the secret. */
  authenticate(secret: string): Promise<{ relayId: string } | null>
  recordSeen(relayId: string): Promise<void>
  recordReport(relayId: string, load: RelayLoad): Promise<void>
  /** Since relay protocol 1.1: what the relay saw of a bundle it carried (`relay.bundleReport`), unread. */
  bundleReport?(relayId: string, frame: Record<string, unknown>): void
  /** Whether an app ticket still stands (`relay.ask`, relay protocol 1.1); absent: none does. */
  answerAsk?(relayId: string, ask: Omit<RelayAsk, 'type' | 'version'>): Promise<boolean>
  /** The refusals a report counted for each app. */
  onAppRefusals?(relayId: string, counts: AppRefusalCounts): void
}

const askId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const askText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512

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

  /** One frame to a connected relay; false when it holds no link. */
  send(relayId: string, frame: object): boolean {
    const ws = this.links.get(relayId)
    if (!ws || ws.readyState !== ws.OPEN) return false
    ws.send(JSON.stringify(frame))
    return true
  }

  /** A frame to every relay connected now: what one relay must stop carrying, any of them might carry. */
  broadcast(frame: RelayLinkFrame): void {
    const text = JSON.stringify(frame)
    for (const ws of this.links.values()) if (ws.readyState === ws.OPEN) ws.send(text)
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
      // Nothing on the link is binary; a frame hq does not read is dropped, and its content is never logged.
      if (isBinary) return
      let frame: unknown
      try {
        frame = JSON.parse(data.toString())
      } catch {
        frame = null
      }
      const f = (typeof frame === 'object' && frame !== null && !Array.isArray(frame) ? frame : {}) as Record<string, unknown>
      if (f.type === 'relay.bundleReport') return deps.bundleReport?.(relayId, f)
      if (f.type === 'relay.ask') return onAsk(ws, relayId, version, f)
      const load = readRelayReportFrame(frame)
      if (!load) {
        logger.warn(`relay ${relayId}: dropped a frame it does not read`)
        return
      }
      void deps.recordReport(relayId, load).catch(err => logger.error(`could not record relay ${relayId}'s report:`, err))
      const refusals = readAppRefusals(frame)
      if (refusals.length) deps.onAppRefusals?.(relayId, refusals)
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      links.remove(relayId, ws)
    })
    ws.on('error', err => logger.warn(`relay ${relayId}:`, err.message))
  }

  /** hq's answer to one ask: no, unless every field reads and hq says the ticket stands. */
  function onAsk(ws: WebSocket, relayId: string, version: string, f: Record<string, unknown>): void {
    if (!askId(f.askId)) return
    const send = (stands: boolean) => {
      const answer: RelayAnswer = { type: 'relay.answer', version, askId: f.askId as string, stands }
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(answer))
    }
    if (!deps.answerAsk || !askText(f.ticketId) || !askText(f.person) || !askText(f.appId) || !askText(f.livePreviewId)) return send(false)
    deps.answerAsk(relayId, { askId: f.askId, ticketId: f.ticketId, person: f.person, appId: f.appId, livePreviewId: f.livePreviewId })
      .then(send, err => {
        logger.error(`could not answer relay ${relayId}'s ask:`, err)
        send(false)
      })
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
