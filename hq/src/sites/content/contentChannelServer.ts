import { WebSocketServer, type WebSocket } from 'ws'
import type { Server as HttpServer } from 'node:http'
import { HQ_SITE_CONTENT_PATH, CONTENT_PING_INTERVAL_MS, MAX_CHUNK_BYTES } from '@agenthix/core'
import { checkSiteUpgrade, type SiteUpgradeDeps } from '../siteUpgrade'
import type { ContentChannelRegistry } from './contentChannelRegistry'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('ContentChannel')

export interface ContentChannelDeps extends SiteUpgradeDeps {
  registry: ContentChannelRegistry
}

/**
 * The content transport's upgrade (ADR-0063), on its own path beside the
 * control channel's. Authentication and version negotiation are the control
 * channel's own, from siteUpgrade.ts, so the two cannot disagree about who may
 * connect.
 *
 * Liveness is a `ws` protocol ping, not a JSON frame. Every message carries at
 * most one chunk, so a pong is never stuck behind a large transfer — which is
 * the failure the control channel's frame-counting heartbeat would have had.
 */
export function attachContentChannel(server: HttpServer, deps: ContentChannelDeps): void {
  // One chunk plus its 4-byte stream id is the largest binary message the
  // protocol sends; control frames are small JSON. Anything larger is not this
  // protocol, and ws closes the connection rather than buffer it.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CHUNK_BYTES + 64 * 1024 })

  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split('?')[0] !== HQ_SITE_CONTENT_PATH) return // not ours
    void (async () => {
      const accepted = await checkSiteUpgrade(req, socket, deps)
      if (!accepted) return
      wss.handleUpgrade(req, socket, head, ws => onConnection(ws, accepted.siteId))
    })()
  })

  function onConnection(ws: WebSocket, siteId: string): void {
    const mux = deps.registry.add(siteId, ws)
    let awaitingPong = false

    const heartbeat = setInterval(() => {
      if (awaitingPong) {
        ws.terminate()
        return
      }
      awaitingPong = true
      ws.ping()
    }, CONTENT_PING_INTERVAL_MS)
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
      deps.registry.remove(siteId, ws)
    })

    // 'error' is always followed by 'close', which does the cleanup.
    ws.on('error', err => logger.warn(`${siteId}:`, err.message))
  }
}
