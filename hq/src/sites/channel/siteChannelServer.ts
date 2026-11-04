import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  SITE_PROTOCOL_VERSION,
  HQ_SITE_CHANNEL_PATH,
  checkProtocolCompatibility,
  parseConnectionMessage,
  type HQConnectionMessage,
  type ProtocolVersion,
} from '@agenthix/core'
import { spokenVersion, type SiteChannelRegistry, type SiteConnection } from './siteChannelRegistry'
import { checkSiteUpgrade } from '../siteUpgrade'
import { Logger } from '../../server/utils/logger'
import { holdWhileReadOnly } from '../../server/readOnly'

const logger = new Logger('SiteChannel')

/**
 * Silence for two intervals terminates the socket. Any inbound frame counts as
 * liveness, not just a pong — traffic is proof of reachability, and a busy
 * connection should not be killed for skipping a heartbeat.
 */
const PING_INTERVAL_MS = 30_000

export interface SiteChannelDeps {
  registry: SiteChannelRegistry
  /** `authenticateSite` in production; injected so this file needs no database. */
  authenticate(siteId: string, credential: string): Promise<{ siteId: string } | null>
  /** Told apart from a wrong credential only so a site whose record is gone can be told so — see `siteUpgrade.ts`. */
  siteExists(siteId: string): Promise<boolean>
  /** The old machine's copy of a site a restore replaced is told so — see `siteUpgrade.ts`. */
  replacedAt?(siteId: string, credential: string): Promise<Date | null>
  /** Same checks the content transport runs — see `siteUpgrade.ts`. */
  recordProtocolVersion(siteId: string, version: string): Promise<void>
  markVersionMismatch(siteId: string, version: string, attemptedAt: Date): Promise<void>
  /** `handleSiteEvent` in production; injected for the same reason. */
  onSiteEvent(siteId: string, event: string, data: unknown): Promise<void>
  /**
   * Fired once per accepted connection, AFTER `registry.add` has recorded it
   * (plan 5d-2 task 9a) — the reconcile-on-reconnect hook: `index.ts` wires
   * this to `reconcileSite` followed by `taskRunner.drainHeldTasks`. Optional
   * so tests that don't care about reconnection behaviour can omit it; fires
   * on every connection, not just a site's first, since a mid-session
   * reconnect (network blip, hq restart) needs the same sweep as a cold boot.
   */
  onSiteConnected?(siteId: string): void
}

/**
 * Attaches the Execution Site control channel to the http server socket.io
 * already owns, scoped to one path so every other upgrade is handed back
 * untouched — the same arrangement previewProxy uses for its own upgrades.
 */
export function attachSiteChannel(server: HttpServer, deps: SiteChannelDeps): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    if (pathOf(req.url) !== HQ_SITE_CHANNEL_PATH) return // not ours
    void accept(req, socket, head).catch(err => {
      logger.error('upgrade failed', err)
      socket.destroy()
    })
  })

  async function accept(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const accepted = await checkSiteUpgrade(req, socket, deps)
    if (!accepted) return
    wss.handleUpgrade(req, socket, head, ws => {
      // From the moment it opens: a socket fault emitted with no listener would throw out of hq.
      // 'error' is always followed by 'close', which does the cleanup.
      ws.on('error', err => logger.warn(`${accepted.siteId}:`, err.message))
      void onConnection(ws, accepted.siteId, accepted.speak).catch(err => {
        logger.error(`${accepted.siteId}: connection setup failed:`, err)
        ws.terminate()
        void deps.registry.remove(accepted.siteId, ws).catch(() => {})
      })
    })
  }

  async function onConnection(ws: WebSocket, siteId: string, speak: ProtocolVersion): Promise<void> {
    const conn = await deps.registry.add(siteId, ws, speak)
    let quiet = false

    const heartbeat = setInterval(() => {
      if (quiet) {
        // Nothing since the previous ping. The socket is open as far as TCP is
        // concerned and dead as far as we are — terminate rather than close, so
        // it does not wait on a peer that is not answering.
        ws.terminate()
        return
      }
      quiet = true
      send(ws, { version: spokenVersion(conn), type: 'ping', siteId, payload: {} })
    }, PING_INTERVAL_MS)
    heartbeat.unref?.()

    const closed = () => {
      clearInterval(heartbeat)
      void deps.registry.remove(siteId, ws).catch(err => logger.error(`${siteId}: marking it offline failed:`, err))
    }
    // It closed while the registry recorded it: no 'close' is coming to take it out again.
    if (ws.readyState === ws.CLOSED) return closed()
    ws.on('close', closed)

    ws.on('message', raw => {
      const msg = parseConnectionMessage(raw.toString())
      if (!msg) return
      // The connection's rule, frame by frame: a frame of a major this hq does
      // not talk to is dropped. A peer one minor ahead may name a message type
      // this hq does not know; the switch below ignores it, which is what makes
      // a minor bump additive rather than breaking.
      if (!checkProtocolCompatibility(SITE_PROTOCOL_VERSION, msg.version).ok) return
      // The socket was authenticated as one site. A frame naming another is
      // dropped, so a compromised site cannot answer for its sibling.
      if (msg.siteId !== siteId) return
      quiet = false
      void onMessage(conn, msg).catch(err => logger.error(`${siteId}: ${msg.type} frame failed:`, err))
    })

    deps.onSiteConnected?.(siteId)
  }

  async function onMessage(conn: SiteConnection, msg: HQConnectionMessage): Promise<void> {
    switch (msg.type) {
      case 'pong':
        await deps.registry.touch(conn.siteId)
        return

      case 'channel.response':
        if (msg.replyTo) conn.pending.settle(msg.replyTo, msg.payload)
        return

      case 'channel.error':
        if (msg.replyTo) conn.pending.fail(msg.replyTo, msg.payload)
        return

      case 'site.event': {
        // One-way, no requestId/replyTo (core's SiteEventPayload). A malformed
        // payload is dropped rather than allowed to throw into the socket
        // handler; a handler rejection is caught the same way — a bad frame or
        // a downstream failure must never close the connection.
        const payload = msg.payload as { event?: unknown; data?: unknown } | undefined
        if (typeof payload?.event !== 'string') {
          logger.warn(`${conn.siteId}: malformed site.event frame — dropped`)
          return
        }
        const handle = () => deps.onSiteEvent(conn.siteId, payload.event as string, payload.data)
          .catch(err => logger.error(`${conn.siteId}: site.event handler failed:`, err))
        // While hq moves, what a site reports would change hq's data after the move's backup: it is held.
        if (!holdWhileReadOnly(handle)) void handle()
        return
      }

      case 'channel.request':
        // hq exposes no methods over this socket: spec §4b routes site -> hq
        // calls over ordinary HTTPS, which has no NAT problem to solve. An
        // explicit refusal beats a silent drop the caller can only read as a
        // timeout.
        if (msg.requestId) {
          send(conn.ws, {
            version: spokenVersion(conn),
            type: 'channel.error',
            siteId: conn.siteId,
            replyTo: msg.requestId,
            payload: { message: 'hq exposes no channel methods', code: 'unknown_method' },
          })
        }
        return

      case 'site.detach':
        logger.info(`${conn.siteId} detached`)
        conn.ws.close(1000, 'Site detached')
        return

      default:
        // A type this hq does not know (a site a minor ahead may send one) is dropped without effect.
        return
    }
  }
}

function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0]
}

function send(ws: WebSocket, msg: HQConnectionMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}
