/**
 * The console link (host-management spec §4 C8, `/console-link`): the Fleet Console dials it with the pairing secret
 * (on hq's machine) or its lasting console credential, as `Authorization: Bearer`; a Fleet Console installed elsewhere
 * presents the lookup of its one-time code once instead (`X-Console-Code`). For a code hq made, it is given its
 * credential as the link's first frame. For a handover code from the running Fleet Console, the connection first
 * waits while the running one checks it (handover.ts), is given its credential once it holds the machines, and
 * becomes the console link only when it acknowledges that credential — or presents it on a new connection, when this
 * one dropped first.
 *
 * Over it hq relays envelopes to and from host services (relayHub.ts), and answers the Fleet Console's own requests —
 * the closed set in core's `ConsoleLinkMethods`, anything else `unknown_method`. Its first frame once usable,
 * `console.hello`, says whether it has just started; only then are the joins it opened before let go, so a Fleet Console
 * that only lost its connection for a moment keeps them.
 */
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { HQ_CONSOLE_CODE_HEADER, HQ_CONSOLE_LINK_PATH, type HostIdentity, type ConsoleLinkErrorCode } from '@agenthix/core'
import type { CompletedHandover } from '../handover'
import { readHandoverAsk } from './joinRequest'
import { Logger } from '../../server/utils/logger'
import { LINK_MAX_PAYLOAD_BYTES, LINK_PING_INTERVAL_MS, frame, parseFrame, readEnvelope, send } from './frames'
import { CLOSE_HANDOVER_ENDED, type RelayHub } from './relayHub'
import { bearerOf, headerOf, pathOf, precheckUpgrade, refuseUpgrade } from './upgrade'

export { CLOSE_HANDOVER_ENDED }

const logger = new Logger('ConsoleLink')

export type ConsoleAnswer = { ok: true; result: unknown } | { ok: false; code: ConsoleLinkErrorCode; message: string }

export interface ConsoleLinkDeps {
  hub: RelayHub
  /** The pairing secret or the lasting credential. */
  authenticateConsole(presented: string): Promise<boolean>
  /** Spends the lookup of a code hq made: the new lasting credential, or null. Retires the credential before it. */
  redeemConsoleCode(lookup: string): Promise<string | null>
  /** Spends the lookup of a handover code: the handover it opens, or null. */
  claimHandover(lookup: string): Promise<{ handoverId: string; expiresAt: Date } | null>
  /** Keeps the new Fleet Console's fingerprint; null when the handover is not waiting for it. */
  recordHandoverAsk(handoverId: string, identity: HostIdentity): Promise<string | null>
  /** The new Fleet Console holds the machines: its credential, not yet in force. */
  issueHandoverCredential(handoverId: string, certificate: unknown): Promise<string | null>
  /** It acknowledged the credential: the move is done. */
  completeHandover(handoverId: string): Promise<CompletedHandover | null>
  /** It presented a credential a handover is waiting to have acknowledged: the move is done. */
  completeHandoverWithCredential(presented: string): Promise<(CompletedHandover & { handoverId: string }) | null>
  handleRequest(method: string, params: unknown): Promise<ConsoleAnswer>
  /**
   * The Fleet Console says it has just started (`console.hello`): it holds none of the joins open before `at`, whose
   * codes lived in an earlier start's memory, so they end (joins.ts).
   */
  consoleStarted?(at: Date): Promise<void>
  now?(): Date
}

const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/
const LOOKUP = /^[0-9a-f]{64}$/
/** Frames a new Fleet Console may send between its acknowledgement and the move being done; they wait for it. */
const MAX_HELD_FRAMES = 64

type Handover = { kind: 'handover'; handoverId: string; expiresAt: Date; asked: boolean; finishing: boolean; sent: boolean; acking: boolean }
type Mode = { kind: 'console' } | Handover

export function attachConsoleLink(server: HttpServer, deps: ConsoleLinkDeps): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LINK_MAX_PAYLOAD_BYTES })

  server.on('upgrade', (req, socket, head) => {
    if (pathOf(req.url) !== HQ_CONSOLE_LINK_PATH) return
    void accept(req, socket, head).catch(err => {
      logger.error('upgrade failed', err)
      refuseUpgrade(socket, 500, 'Internal Server Error')
    })
  })

  async function accept(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (!precheckUpgrade(req, socket)) return
    const presented = bearerOf(req)
    const lookup = headerOf(req, HQ_CONSOLE_CODE_HEADER).toLowerCase()
    if (presented) {
      if (await deps.authenticateConsole(presented)) return void wss.handleUpgrade(req, socket, head, ws => serve(ws, { kind: 'console' }))
      const moved = await deps.completeHandoverWithCredential(presented)
      if (!moved) return refuseUpgrade(socket, 401, 'Unauthorized')
      // Done in the database whatever becomes of this connection, so the live routes follow at once.
      deps.hub.finishHandover(moved.handoverId, moved)
      logger.info('The Fleet Console moved: the one before is retired')
      return void wss.handleUpgrade(req, socket, head, ws => serve(ws, { kind: 'console' }))
    }
    if (!LOOKUP.test(lookup)) return refuseUpgrade(socket, 401, 'Unauthorized')
    const credential = await deps.redeemConsoleCode(lookup)
    if (credential) {
      return void wss.handleUpgrade(req, socket, head, ws => {
        // The console before this one presented a credential that no longer exists: its link goes now.
        deps.hub.retireConsole()
        send(ws, frame('console.credential', { credential }))
        serve(ws, { kind: 'console' })
      })
    }
    const handover = await deps.claimHandover(lookup)
    if (!handover) return refuseUpgrade(socket, 401, 'Unauthorized')
    wss.handleUpgrade(req, socket, head, ws => serve(ws, {
      kind: 'handover', ...handover, asked: false, finishing: false, sent: false, acking: false,
    }))
  }

  function serve(ws: WebSocket, initial: Mode): void {
    let mode: Mode = initial
    /** While the move is being made done: what the new Fleet Console sent meanwhile, in order. */
    let held: string[] | null = null
    let expiry: ReturnType<typeof setTimeout> | null = null
    const end = () => ws.close(CLOSE_HANDOVER_ENDED, 'Handover ended')

    if (mode.kind === 'console') deps.hub.setConsole(ws)
    else {
      deps.hub.addHandover(mode.handoverId, ws, () => {
        if (expiry) clearTimeout(expiry)
        mode = { kind: 'console' }
        deps.hub.setConsole(ws)
        const waiting = held ?? []
        held = null
        for (const text of waiting) onText(text)
      })
      expiry = setTimeout(end, Math.max(0, mode.expiresAt.getTime() - (deps.now?.() ?? new Date()).getTime()))
      expiry.unref?.()
    }
    let quiet = false
    const heartbeat = setInterval(() => {
      if (quiet) return void ws.terminate()
      quiet = true
      send(ws, frame('ping', {}))
    }, LINK_PING_INTERVAL_MS)
    heartbeat.unref?.()

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return
      quiet = false
      const text = raw.toString()
      if (held) {
        if (held.length >= MAX_HELD_FRAMES) return end()
        held.push(text)
        return
      }
      onText(text)
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      if (expiry) clearTimeout(expiry)
      if (mode.kind === 'handover') deps.hub.removeHandover(mode.handoverId, ws)
      else deps.hub.removeConsole(ws)
    })
    ws.on('error', err => logger.warn(err.message))

    function onText(text: string): void {
      const f = parseFrame(text)
      if (!f) return
      if (f.type === 'ping') return void send(ws, frame('pong', {}))
      if (f.type === 'pong') return
      if (mode.kind === 'handover') return onHandoverFrame(mode, f.type, f.payload)
      switch (f.type) {
        case 'relay.envelope': {
          const read = readEnvelope(f.payload, Buffer.byteLength(text))
          if ('refused' in read) return deps.hub.undeliverable(ws, read.refused.envelopeId, read.refused.reason)
          return void deps.hub.fromConsole(ws, read.envelope).catch(err => logger.error('relay failed', err))
        }
        case 'console.request':
          return void answer(ws, f.requestId, f.payload)
        case 'console.hello': {
          const started = (f.payload as { started?: unknown } | null)?.started === true
          if (!started || !deps.consoleStarted) return
          return void deps.consoleStarted(deps.now?.() ?? new Date()).catch(err => logger.error('ending the joins of an earlier start failed', err))
        }
        default:
          return
      }
    }

    /**
     * A new Fleet Console before the move is done: it may send its half once, say it holds the machines once the
     * running one answered, and acknowledge its credential once. It relays nothing and asks hq nothing else.
     */
    function onHandoverFrame(m: Handover, type: string, payload: unknown): void {
      if (type === 'console.handoverAsk' && !m.asked) {
        m.asked = true
        const ask = readHandoverAsk(payload)
        if (!ask) return end()
        void deps.recordHandoverAsk(m.handoverId, ask.identity).then(fp => {
          if (!fp) return end()
          deps.hub.setHandoverAsk(m.handoverId, ask)
        }).catch(err => {
          logger.error('handover ask failed', err)
          end()
        })
        return
      }
      if (type === 'console.handoverDone' && m.asked && !m.finishing) {
        m.finishing = true
        if (ws.readyState !== ws.OPEN) return
        const certificate = payload && typeof payload === 'object' ? (payload as { certificate?: unknown }).certificate : undefined
        void deps.issueHandoverCredential(m.handoverId, certificate).then(credential => {
          if (!credential) return end()
          m.sent = deps.hub.sendHandoverCredential(m.handoverId, credential)
        }).catch(err => {
          logger.error('handover failed', err)
          end()
        })
        return
      }
      if (type === 'console.handoverAck' && m.sent && !m.acking) {
        m.acking = true
        held = []
        void deps.completeHandover(m.handoverId).then(done => {
          if (!done) return end()
          deps.hub.finishHandover(m.handoverId, done, ws)
          logger.info('The Fleet Console moved: the one before is retired')
        }).catch(err => {
          logger.error('handover failed', err)
          end()
        })
      }
    }
  }

  async function answer(ws: WebSocket, requestId: string | undefined, payload: unknown): Promise<void> {
    if (!requestId || !REQUEST_ID.test(requestId)) return
    const p = payload && typeof payload === 'object' ? (payload as { method?: unknown; params?: unknown }) : {}
    let outcome: ConsoleAnswer
    try {
      outcome = typeof p.method === 'string'
        ? await deps.handleRequest(p.method, p.params)
        : { ok: false, code: 'malformed', message: 'A request names a method.' }
    } catch (err) {
      logger.error('request failed', err)
      outcome = { ok: false, code: 'failed', message: 'HQ could not do that.' }
    }
    if (outcome.ok) send(ws, frame('console.response', outcome.result, { replyTo: requestId }))
    else send(ws, frame('console.error', { code: outcome.code, message: outcome.message }, { replyTo: requestId }))
  }
}
