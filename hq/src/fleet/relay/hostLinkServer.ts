/**
 * The host link (host-management spec §4 C3, `/host-link`): each host service dials it with its machine credential,
 * or, while it joins, with the lookup derived from its one-time code (`X-Host-Join`). A lookup works once: the
 * connection that presents it spends it, and is either accepted by the fleet admin — `host.joined`, after which it
 * carries on as that host's link — or refused, or runs out of time.
 */
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { HOST_JOIN_LOOKUP_HEADER, HQ_HOST_LINK_PATH, type HostIdentity, type JoinRequest, type ConsoleHandoverCertificate } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { LINK_MAX_PAYLOAD_BYTES, LINK_PING_INTERVAL_MS, frame, parseFrame, readEnvelope, send } from './frames'
import type { JoinRequestPayload, RelayHub, RelayPeer } from './relayHub'
import { bearerOf, headerOf, pathOf, precheckUpgrade, refuseUpgrade } from './upgrade'
import { readJoinRequest } from './joinRequest'
import { isTransferFrame } from './transfers'
import { seenFromAddress } from './seenFrom'
import { trustedProxyCount } from '../../server/trustedProxies'

const logger = new Logger('HostLink')

export type JoinClaim =
  | { ok: true; joinId: string; expiresAt: Date }
  | { ok: false; reason: 'refused' | 'expired' | 'used' }

export interface HostLinkDeps {
  hub: RelayHub
  authenticateHost(credential: string): Promise<RelayPeer | null>
  /** Spends the lookup: null when no join has it. */
  claimJoin(lookup: string): Promise<JoinClaim | null>
  /** Keeps the machine's half of the join; false when the join is no longer waiting for it. */
  recordJoinRequest(joinId: string, request: { fingerprint: string; identity: HostIdentity; machineName: string; binding: string }): Promise<boolean>
  fingerprintOf(identity: HostIdentity): Promise<string>
  touchHost?(hostId: string): Promise<void>
  /** Every finished move of the Fleet Console, oldest first: a machine that slept through one follows it now. */
  handoverCertificates?(): Promise<ConsoleHandoverCertificate[]>
  /** The proxies in front of hq-server; `HQ_TRUSTED_PROXIES` when absent. */
  trustedProxies?: number
  now?(): Date
}

const LOOKUP = /^[0-9a-f]{64}$/

type LinkState = { kind: 'joining'; joinId: string; lookup: string; asked: boolean } | { kind: 'host'; peer: RelayPeer }

export function attachHostLink(server: HttpServer, deps: HostLinkDeps): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LINK_MAX_PAYLOAD_BYTES })
  const now = () => deps.now?.() ?? new Date()

  server.on('upgrade', (req, socket, head) => {
    if (pathOf(req.url) !== HQ_HOST_LINK_PATH) return
    void accept(req, socket, head).catch(err => {
      logger.error('upgrade failed', err)
      refuseUpgrade(socket, 500, 'Internal Server Error')
    })
  })

  async function accept(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (!precheckUpgrade(req, socket)) return
    const seenFrom = seenFromAddress(req, deps.trustedProxies ?? trustedProxyCount())
    const credential = bearerOf(req)
    if (credential) {
      const peer = await deps.authenticateHost(credential)
      if (!peer) return refuseUpgrade(socket, 401, 'Unauthorized')
      wss.handleUpgrade(req, socket, head, ws => serve(listened(ws), { kind: 'host', peer }, seenFrom))
      return
    }
    const lookup = headerOf(req, HOST_JOIN_LOOKUP_HEADER).toLowerCase()
    if (!LOOKUP.test(lookup)) return refuseUpgrade(socket, 401, 'Unauthorized')
    const claim = await deps.claimJoin(lookup)
    if (!claim) return refuseUpgrade(socket, 401, 'Unauthorized')
    wss.handleUpgrade(req, socket, head, opened => {
      const ws = listened(opened)
      // A lookup that matched a join no longer open is told why in a frame, so the machine can say it in words.
      if (!claim.ok) {
        send(ws, frame('host.joinRefused', { reason: claim.reason }))
        ws.close(4002, 'Join ended')
        return
      }
      serve(ws, { kind: 'joining', joinId: claim.joinId, lookup, asked: false }, seenFrom, claim.expiresAt)
    })
  }

  /**
   * Every socket listens for 'error' from the moment it opens, whichever way it goes on: ws emits one for a bad frame
   * even while it closes, and one with no listener would throw out of hq. 'error' is always followed by 'close'.
   */
  function listened(ws: WebSocket): WebSocket {
    ws.on('error', err => logger.warn(err.message))
    return ws
  }

  function serve(ws: WebSocket, initial: LinkState, seenFrom: string | null, joinExpiresAt?: Date): void {
    let state = initial
    let quiet = false
    let expiry: NodeJS.Timeout | undefined
    // A machine keeps its live previews from the public address it is seen from (core's `HqSeenFromFrame`): told on
    // every connection, so a new address reaches it with the connection that comes from it. Never to a join not yet done.
    const tellSeenFrom = () => { if (seenFrom) send(ws, frame('hq.seenFrom', { address: seenFrom })) }

    if (state.kind === 'host') {
      deps.hub.addHost(state.peer, ws)
      tellSeenFrom()
      void handCertificates(ws)
    } else {
      const joinId = state.joinId
      deps.hub.addJoining(joinId, ws, peer => {
        clearTimeout(expiry)
        state = { kind: 'host', peer }
        deps.hub.addHost(peer, ws)
        tellSeenFrom()
      })
      expiry = setTimeout(() => deps.hub.endJoin(joinId, 'expired'), Math.max(0, (joinExpiresAt?.getTime() ?? 0) - now().getTime()))
      expiry.unref?.()
    }

    const heartbeat = setInterval(() => {
      if (quiet) return void ws.terminate()
      quiet = true
      send(ws, frame('ping', {}))
    }, LINK_PING_INTERVAL_MS)
    heartbeat.unref?.()

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return
      const text = raw.toString()
      const f = parseFrame(text)
      if (!f) return
      quiet = false
      if (f.type === 'ping') return void send(ws, frame('pong', {}))
      if (f.type === 'pong') {
        if (state.kind === 'host') void deps.touchHost?.(state.peer.hostId).catch(() => {})
        return
      }
      if (state.kind === 'host' && f.type === 'relay.envelope') {
        const read = readEnvelope(f.payload, Buffer.byteLength(text))
        if ('refused' in read) return deps.hub.undeliverable(ws, read.refused.envelopeId, read.refused.reason)
        return deps.hub.fromHost(state.peer, ws, read.envelope)
      }
      if (state.kind === 'host' && isTransferFrame(f.type)) {
        return deps.hub.transfers.fromHost(state.peer.hostId, ws, f.type, f.payload, Buffer.byteLength(text))
      }
      if (state.kind === 'joining' && f.type === 'host.join' && !state.asked) {
        state.asked = true
        const joinId = state.joinId
        void onJoin(ws, joinId, state.lookup, f.payload).catch(err => {
          logger.error('join request failed', err)
          deps.hub.endJoin(joinId, 'refused')
        })
      }
      // Anything else — including envelopes from a machine still joining — is dropped.
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      clearTimeout(expiry)
      if (state.kind === 'host') deps.hub.removeHost(state.peer.hostId, ws)
      else deps.hub.removeJoining(state.joinId, ws)
    })
  }

  async function handCertificates(ws: WebSocket): Promise<void> {
    const certificates = await deps.handoverCertificates?.().catch(err => {
      logger.error('handover certificates unavailable', err)
      return []
    })
    if (certificates?.length) send(ws, frame('console.handover', { certificates }))
  }

  async function onJoin(ws: WebSocket, joinId: string, lookup: string, payload: unknown): Promise<void> {
    const request: JoinRequest | null = readJoinRequest(payload)
    if (!request || request.lookup !== lookup) return void deps.hub.endJoin(joinId, 'refused')
    const fingerprint = await deps.fingerprintOf(request.identity)
    const kept = await deps.recordJoinRequest(joinId, {
      fingerprint, identity: request.identity, machineName: request.machineName, binding: request.binding,
    })
    if (!kept || ws.readyState !== ws.OPEN) return void deps.hub.endJoin(joinId, 'expired')
    const forward: JoinRequestPayload = {
      joinId, identity: request.identity, machineName: request.machineName, ...(request.runsHq ? { runsHq: true as const } : {}),
      ...(request.restores ? { restores: request.restores } : {}), binding: request.binding,
    }
    deps.hub.setJoinRequest(forward)
  }
}
