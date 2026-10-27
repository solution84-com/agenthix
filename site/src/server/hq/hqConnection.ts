import WebSocket from 'ws'
import { prisma } from '#db'
import {
  SITE_PROTOCOL_VERSION,
  SITE_SILENCE_TIMEOUT_MS,
  type HQConnectionMessage,
  type SiteEventName,
  type SiteEvents,
  SITE_HEALTH_EVENT,
  SCHEDULED_CHANGE_EVENT,
} from '@agenthix/core'
import { resolveChannelUrl, resolveContentUrl } from './resolveChannelUrl'
import { answerChannelRequest, type ReceivedRequest } from './channelAnswer'
import {
  SITE_UNKNOWN_MESSAGE, hqRefusalMessage, isUnknownSite, replacedAtOf, replacedMessage, siteDialHeaders, statedHqVersion,
} from './hqAnswers'
import { ContentConnection } from './content/contentConnection'
import { Logger } from '../utils/logger'
import { readConnectionToken } from './connectionToken'
import { startHealthReports, type HealthReporter } from './siteHealthReport'
import { hostFigures } from '../host/hostFigures'
import { startScheduledRelay } from '../host/scheduledRelay'
import type { HqLinkProblem } from './linkProblem'
import { relayLines } from '../relay/relayLines'

const RECONNECT_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 60_000

let silenceTimeoutMs = SITE_SILENCE_TIMEOUT_MS

/** Test-only: shortens the silence watchdog. Called with no argument, restores the production value. */
export function setSilenceTimeoutForTests(ms: number = SITE_SILENCE_TIMEOUT_MS): void {
  silenceTimeoutMs = ms
}

// Scoped to sendEvent only (SiteStreamEmitter's fire-and-forget frames, plan
// 5d-2 task 7b) — matching the Logger convention every moved runtime module
// uses, rather than the raw console.log/[HQ]-prefix this file's older code
// predates that convention with.
const logger = new Logger('HqConnection')

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

class HqConnectionManager {
  private ws: WebSocket | null = null
  private content: ContentConnection | null = null
  private state: ConnectionState = 'disconnected'
  requiredProtocolVersion: string | null = null
  // Why the link is not up, for the site's status command: in words, and as a cause the host service passes on.
  lastError: string | null = null
  problem: HqLinkProblem | null = null
  private reconnectDelay = RECONNECT_DELAY_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private siteId: string | null = null
  private terminated = false
  // Review round: sendEvent's drop log is once-per-state-transition, not
  // once-per-frame — see sendEvent's own comment for why.
  private dropLogged = false
  // Plan 5d-2 task 8 (SC-342): callbacks fired every time the socket actually
  // opens — not just the first connect, every reconnect too — so setup.ts can
  // flush its boot-sweep buffer (and anything else that needs "the channel
  // just became usable") without polling connection state itself.
  private openListeners: Array<() => void> = []
  // The site's health, and the scheduled changes' notices from the host service, go to hq while the channel is open.
  private stopHealth: (() => void) | null = null
  private healthReporter: HealthReporter = send => startHealthReports(send)

  async start(): Promise<void> {
    this.terminated = false
    const record = await prisma.hqConnection.findFirst({
      where: { status: { in: ['ACTIVE', 'DEGRADED', 'PENDING', 'VERSION_MISMATCH'] } },
    })
    if (!record || !record.hqWsUrl) return
    const token = readConnectionToken(record.connectionToken)
    if (!token) {
      this.lastError = 'no usable hq credential is stored — a fleet admin adds this site again in the Fleet Console (hq’s own site pairs at its next start)'
      return
    }

    const siteConfig = await prisma.siteConfig.findFirst()
    if (!siteConfig) return

    this.siteId = siteConfig.siteId

    const url = resolveChannelUrl(record.hqWsUrl)
    if (!url) {
      logger.error(`Stored hq websocket url is unusable: ${record.hqWsUrl}`)
      return
    }

    this.connect(url, token, siteConfig.siteId)

    // The content transport rides the same registration and credential, and
    // lives and dies with the control channel. A second start() without a
    // stop() leaves it alone, as connect() does for the control channel —
    // boot's start() and a fresh registration's restart() can interleave.
    //
    // The content connection's own refusal never decides this site's connection
    // status — only the control channel does, as on hq. A genuine mismatch is
    // reported by the control channel too, since both reach the same hq through
    // the same check; this only slows the content connection (which it does
    // itself) and says so once.
    const contentUrl = resolveContentUrl(record.hqWsUrl)
    if (contentUrl && !this.content) {
      let lastContentStated: string | undefined | null = null
      this.content = new ContentConnection({
        url: contentUrl,
        token,
        siteId: siteConfig.siteId,
        onVersionMismatch: stated => {
          if (stated === lastContentStated) return
          lastContentStated = stated
          logger.error(`content transport refused. ${hqRefusalMessage(stated)}`)
        },
      })
      this.content.start()
    }
  }

  private connect(hqWsUrl: string, token: string, siteId: string): void {
    if (this.state !== 'disconnected') return
    this.state = 'connecting'

    const ws = new WebSocket(hqWsUrl, { headers: siteDialHeaders(token, siteId) })
    // Tracked from creation, not from 'open': stop() calling ws.close() while
    // still mid-handshake needs a live reference to abort, and every handler
    // below checks this same identity before touching shared state — a
    // superseded attempt's late event (e.g. a slow socket stop() raced ahead
    // of) must never stomp the attempt that replaced it.
    this.ws = ws
    // Whether hq answered this handshake at all. terminate() on a refused
    // handshake also raises 'error', which must not undo what the answer said.
    let answered = false

    ws.on('unexpected-response', (_req, res) => {
      if (this.ws !== ws) { res.resume(); return }
      answered = true
      const replaced = res.statusCode === 401 ? replacedAtOf(res.headers) : null
      if (replaced) {
        // hq answered: a restore onto another machine replaced this copy, and no retry can succeed. Only this
        // answer counts as one — a network failure never does. Claimed terminated before anything async, as below.
        this.terminated = true
        this.problem = 'credentialRefused'
        res.resume()
        ws.terminate()
        const reason = replacedMessage(replaced)
        this.handleRevoke(reason, replaced).catch(err => logger.error('replaced-site handling failed', err))
        logger.error(reason)
        return
      }
      if (isUnknownSite(res.statusCode ?? 0, res.headers)) {
        // hq answered, and has no record of this site: retrying cannot help.
        // Claim terminated before anything async, so the close that follows
        // the terminate below does not mark the link DEGRADED or reconnect.
        this.terminated = true
        this.problem = 'credentialRefused'
        res.resume()
        ws.terminate()
        this.handleRevoke(SITE_UNKNOWN_MESSAGE).catch(err => logger.error('unknown-site handling failed', err))
        logger.error(SITE_UNKNOWN_MESSAGE)
        return
      }
      if (res.statusCode === 426) {
        this.handleVersionMismatch(statedHqVersion(res.headers))
      } else {
        // Any other refusal is its own problem now, and must read as one.
        this.requiredProtocolVersion = null
        this.lastError = `hq refused the connection (HTTP ${res.statusCode})`
      }
      this.problem = res.statusCode === 426 ? 'versionMismatch' : res.statusCode === 401 ? 'credentialRefused' : 'unreachable'
      res.resume()
      ws.terminate()
    })

    ws.on('open', () => {
      if (this.ws !== ws) return
      this.requiredProtocolVersion = null
      this.lastError = null
      this.problem = null
      this.state = 'connected'
      this.reconnectDelay = RECONNECT_DELAY_MS
      this.armSilenceTimer(ws)
      logger.info(`Connected to ${hqWsUrl}`)
      this.updateStatus('ACTIVE').catch(() => {})
      this.stopHealthReports()
      const stopHealth = this.healthReporter(health => this.sendEvent(SITE_HEALTH_EVENT, health))
      const stopRelay = startScheduledRelay(hostFigures, notice => this.sendEvent(SCHEDULED_CHANGE_EVENT, notice))
      this.stopHealth = () => { stopHealth(); stopRelay() }
      for (const listener of this.openListeners) {
        try { listener() } catch (err) { logger.error('open listener failed', err) }
      }
    })

    // hq pings on a schedule, so hearing nothing at all means the path is dead
    // even though this socket still reads as open.
    ws.on('message', (raw) => {
      this.armSilenceTimer(ws)
      try {
        const msg = JSON.parse(raw.toString()) as HQConnectionMessage
        this.handleMessage(msg)
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      if (this.ws !== ws) return
      this.clearSilenceTimer()
      this.stopHealthReports()
      this.ws = null
      this.state = 'disconnected'
      if (this.terminated) return
      if (this.requiredProtocolVersion === null) {
        logger.info(`Connection closed — reconnecting in ${this.reconnectDelay}ms`)
        this.updateStatus('DEGRADED').catch(() => {})
      }
      this.scheduleReconnect(hqWsUrl, token, siteId)
    })

    ws.on('error', (err) => {
      if (this.ws !== ws) return
      logger.error(`WebSocket error:`, err.message)
      if (!answered) {
        this.lastError = err.message
        this.problem = 'unreachable'
      }
      // Never opened and never answered: hq is unreachable, which is its own problem now.
      if (this.state !== 'connected' && !answered) this.requiredProtocolVersion = null
    })
  }

  // Only ever for the current socket: a superseded one's late message must not
  // re-arm a timer that would then terminate its replacement.
  private armSilenceTimer(ws: WebSocket): void {
    if (this.ws !== ws) return
    this.clearSilenceTimer()
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null
      if (this.ws !== ws) return
      logger.error(`heard nothing from hq for ${silenceTimeoutMs}ms — reconnecting`)
      ws.terminate()
    }, silenceTimeoutMs)
    this.silenceTimer.unref?.()
  }

  private stopHealthReports(): void {
    this.stopHealth?.()
    this.stopHealth = null
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  private handleMessage(msg: HQConnectionMessage): void {
    switch (msg.type) {
      case 'ping':
        this.validateAndPong().catch(err => logger.error('pong validation failed', err))
        return
      case 'channel.request':
        if (!this.siteId) return
        answerChannelRequest(msg as ReceivedRequest, this.siteId, reply => this.send(reply))
          .catch(err => logger.error('channel request failed', err))
        return
    }
    if ((msg as { type?: string }).type === 'revoke') {
      // Claim terminated synchronously: hq calls ws.close(4001, …) immediately
      // after sending this message, and the close handler races with the
      // async DB write inside handleRevoke. Without this, the close handler
      // sees terminated=false and flips status to DEGRADED + schedules a
      // reconnect before handleRevoke finishes setting status=REVOKED.
      this.terminated = true
      this.handleRevoke().catch(err => logger.error('revoke handling failed', err))
    }
  }

  // Pong is the liveness contract: "we're reachable AND we still believe
  // we're linked." If the HqConnection row is gone (admin unlinked) or
  // status is REVOKED, we don't pong — we detach and stop. If the DB
  // itself is unreachable, we stay quiet and let HQ's pong-timeout fire.
  private async validateAndPong(): Promise<void> {
    if (!this.siteId) return

    let record
    try {
      record = await prisma.hqConnection.findFirst()
    } catch (err) {
      logger.error('linkage check failed (DB error)', err)
      return
    }

    if (!record) {
      logger.info('linkage gone — sending detach and stopping')
      this.sendDetach()
      this.stop()
      return
    }

    if (record.status === 'REVOKED') {
      logger.info('local status is REVOKED — stopping')
      this.stop()
      return
    }

    this.send({ version: SITE_PROTOCOL_VERSION, type: 'pong', siteId: this.siteId, payload: {} })
  }

  private send(msg: HQConnectionMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private scheduleReconnect(hqWsUrl: string, token: string, siteId: string): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect(hqWsUrl, token, siteId)
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }

  // HqConnection is a singleton (id="singleton") — no siteId filter needed.
  private async updateStatus(status: 'ACTIVE' | 'DEGRADED'): Promise<void> {
    if (!this.siteId) return
    await prisma.hqConnection.updateMany({
      data: {
        status,
        ...(status === 'ACTIVE' ? { connectedAt: new Date() } : {}),
      },
    })
  }

  // Also the end of a link hq no longer recognises.
  private async handleRevoke(reason = 'revoked by hq', replacedAt: Date | null = null): Promise<void> {
    if (!this.siteId) return
    this.lastError = reason
    await prisma.hqConnection.updateMany({
      data: { status: 'REVOKED', ...(replacedAt ? { replacedAt } : {}) },
    })
    this.stop()
    logger.info(`Connection ended: ${reason}`)
  }

  /** Replaces how health is reported: a test that opens a channel passes one that runs no Docker command. */
  setHealthReporter(reporter: HealthReporter): void {
    this.healthReporter = reporter
  }

  /** Registered once at boot (setup.ts) — never de-registered, so a listener
   *  fires on every reconnect for the life of the process. */
  onOpen(listener: () => void): void {
    this.openListeners.push(listener)
  }

  connectionState(): ConnectionState {
    return this.state
  }

  sendDetach(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.siteId) return
    try {
      this.ws.send(JSON.stringify({
        version: SITE_PROTOCOL_VERSION,
        type: 'site.detach',
        siteId: this.siteId,
        payload: {},
      }))
    } catch {
      // best-effort; if it fails, the WS will close and HQ will go OFFLINE then admin can clean up
    }
  }

  /**
   * One-way site → hq event frame (plan 5d-2 D4, task 7b) — run.status and
   * run.stream from SiteStreamEmitter, run today's site.credentialHealth is
   * reserved for a later task. No requestId: hq does not answer these, and a
   * closed channel just drops the frame — the transcript (for stream) and hq's
   * own run.list reconcile on reconnect (for status) are the durable records,
   * not this socket. Fire-and-forget by design, matching `sendDetach`'s own
   * best-effort posture just below.
   */
  sendEvent<E extends SiteEventName>(event: E, data: SiteEvents[E]): void {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.siteId) {
      // Once per closed-channel period, not once per frame: a run
      // in progress while hq is unreachable can produce tens of thousands of
      // stream frames, and D4 already treats a drop here as drop-by-design, not
      // an error — a line per frame would drown the log for no diagnostic gain
      // beyond the first one. Resets below once a send actually goes out, so a
      // later outage logs again.
      if (!this.dropLogged) {
        logger.warn(`sendEvent(${event}) dropped — channel not open (further drops silent until the channel reopens)`)
        this.dropLogged = true
      }
      return
    }
    this.dropLogged = false
    this.send({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: this.siteId,
      payload: { event, data },
    })
  }

  // stop() is the explicit "we're done, don't try to reconnect" signal.
  // Setting `terminated` here covers every caller (HQ revoke, local-detach
  // via validateAndPong, manual restart) without each having to remember.
  // start()/restart() reset it.
  stop(): void {
    this.terminated = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearSilenceTimer()
    this.stopHealthReports()
    this.content?.stop()
    this.content = null
    // The relay line is hq's to assign, and hq assigns again once the link is back.
    relayLines.stop()
    this.ws?.close()
    this.ws = null
    this.state = 'disconnected'
  }

  /**
   * hq is up and refusing this site's protocol version: majors too far apart,
   * and the message says which side must upgrade. Not a network failure, so
   * not DEGRADED; not revoked, so the credential stays. Retry at the slowest
   * pace — whichever side is upgraded, the site reconnects on its own.
   */
  private handleVersionMismatch(stated: string | undefined): void {
    const required = stated ?? 'a different major'
    const message = hqRefusalMessage(stated)
    if (this.requiredProtocolVersion !== required) logger.error(message)
    this.requiredProtocolVersion = required
    this.lastError = message
    this.reconnectDelay = MAX_RECONNECT_DELAY_MS
    prisma.hqConnection.updateMany({ data: { status: 'VERSION_MISMATCH' } }).catch(() => {})
  }

  // Called after an attach to start the connection immediately without server restart.
  async restart(): Promise<void> {
    this.stop()
    this.terminated = false
    this.reconnectDelay = RECONNECT_DELAY_MS
    await this.start()
  }
}

export const hqConnectionManager = new HqConnectionManager()
