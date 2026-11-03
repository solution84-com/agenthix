/**
 * The hq link: one WebSocket the relay dials to hq's `RELAY_HQ_LINK_PATH` with the shared secret, and keeps open,
 * reconnecting with backoff when it drops. hq greets it with `relay.welcome`, which tells the relay its own id (the
 * audience of the passes it accepts); the relay reports its load every `RELAY_REPORT_INTERVAL_MS`. Nothing dials
 * the relay's link.
 *
 * Since relay protocol 1.1, for live apps: before every new stream to an app the relay asks hq whether the ticket
 * behind the cookie still stands (`relay.ask`, answered by `relay.answer` within `RELAY_ASK_TIMEOUT_MS`, or taken as
 * no), and hq tells it what is cut off (`relay.revoke`), which it only ever narrows: a revocation ends streams and
 * forgets tickets, never opens anything. hq's one order is `relay.bundle`: carry a bundle between two sites' lines
 * (`../bundles/carryBundle.ts`), which each site checks itself.
 */
import { randomBytes } from 'node:crypto'
import WebSocket from 'ws'
import {
  RELAY_ASK_TIMEOUT_MS, RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, RELAY_REPORT_INTERVAL_MS,
  checkProtocolCompatibility, peerRefusalMessage, type RelayAsk, type RelayLinkReport, type RelayRevoke,
} from '@agenthix/core'
import type { AppRefusals } from '../apps/appRefusals'
import { readRevoke } from './revokeFrame'
import type { Load } from '../load'
import type { Log } from '../log'
import { RELAY_CHANGED_CLOSE_CODE, type SiteLines } from '../lines/siteLines'

const FIRST_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 60_000
const PING_EVERY_MS = 30_000
const MAX_FRAME_BYTES = 64 * 1024

export type HqLinkOptions = {
  hqAddress: string
  secret: string
  lines: SiteLines
  load: Load
  log: Log
  reportIntervalMs?: number
  firstReconnectMs?: number
  /** hq's orders on the link, beside its welcome: since relay protocol 1.1, `relay.bundle`. */
  onOrder?: (frame: Record<string, unknown>) => void
  /** Apps' streams, reported with files' as the open streams. */
  appLoad?: Load
  refusals?: AppRefusals
  /** What hq cut off, read and checked. */
  onRevoke?(frame: RelayRevoke): void
  askTimeoutMs?: number
}

/** Asks waiting for hq's answer; past this many a new ask is answered no at once. */
const MAX_PENDING_ASKS = 10_000

export function relayLinkUrl(hqAddress: string): string {
  const url = new URL(hqAddress)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = RELAY_HQ_LINK_PATH
  url.search = ''
  url.hash = ''
  return url.toString()
}

export class HqLink {
  private ws: WebSocket | null = null
  private id: string | null = null
  private stopped = true
  private reconnectDelay: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reportTimer: ReturnType<typeof setInterval> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private lastProblem: string | null = null
  private readonly pending = new Map<string, (stands: boolean) => void>()

  constructor(private readonly options: HqLinkOptions) {
    this.reconnectDelay = options.firstReconnectMs ?? FIRST_RECONNECT_MS
  }

  /** This relay's id, as hq last named it; null until hq greets it. */
  get relayId(): string | null {
    return this.id
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  start(): void {
    this.stopped = false
    this.connect()
  }

  /** Whether the app ticket still stands, by hq's word; no when hq does not answer in time, or the link is down. */
  ask(q: { ticketId: string; person: string; appId: string; livePreviewId: string }): Promise<boolean> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || this.pending.size >= MAX_PENDING_ASKS) return Promise.resolve(false)
    const askId = randomBytes(16).toString('base64url')
    const frame: RelayAsk = { type: 'relay.ask', version: RELAY_PROTOCOL_VERSION, askId, ...q }
    return new Promise(resolve => {
      const timer = setTimeout(() => settle(false), this.options.askTimeoutMs ?? RELAY_ASK_TIMEOUT_MS)
      timer.unref?.()
      const settle = (stands: boolean) => {
        clearTimeout(timer)
        this.pending.delete(askId)
        resolve(stands)
      }
      this.pending.set(askId, settle)
      ws.send(JSON.stringify(frame))
    })
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.clearTimers()
    this.ws?.close()
    this.ws = null
  }

  private connect(): void {
    if (this.stopped || this.ws) return
    const ws = new WebSocket(relayLinkUrl(this.options.hqAddress), {
      headers: { Authorization: `Bearer ${this.options.secret}`, [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION },
      maxPayload: MAX_FRAME_BYTES,
      followRedirects: false,
    })
    this.ws = ws

    ws.on('unexpected-response', (_req, res) => {
      res.resume()
      if (res.statusCode === 401) this.problem("hq refused the relay's secret: HQ_RELAY_SECRET must be the one in hq's environment.")
      else if (res.statusCode === 426) {
        const stated = res.headers[RELAY_PROTOCOL_VERSION_HEADER.toLowerCase()]
        this.problem(peerRefusalMessage(RELAY_PROTOCOL_VERSION, Array.isArray(stated) ? stated[0] : stated, { own: 'this relay', peer: 'hq' }))
      } else this.problem(`hq answered ${res.statusCode} on the relay link.`)
      ws.terminate()
    })
    ws.on('open', () => {
      this.reconnectDelay = this.options.firstReconnectMs ?? FIRST_RECONNECT_MS
      this.lastProblem = null
      this.options.log('connected to hq')
      this.report()
      this.reportTimer = setInterval(() => this.report(), this.options.reportIntervalMs ?? RELAY_REPORT_INTERVAL_MS)
      this.reportTimer.unref?.()
      let awaitingPong = false
      ws.on('pong', () => { awaitingPong = false })
      this.pingTimer = setInterval(() => {
        if (awaitingPong) {
          ws.terminate()
          return
        }
        awaitingPong = true
        ws.ping()
      }, PING_EVERY_MS)
      this.pingTimer.unref?.()
    })
    ws.on('message', (data, isBinary) => {
      if (!isBinary) this.onFrame(data.toString())
    })
    ws.on('close', () => {
      if (this.ws !== ws) return
      for (const settle of [...this.pending.values()]) settle(false)
      this.ws = null
      this.clearTimers()
      this.scheduleReconnect()
    })
    ws.on('error', err => this.problem(`the relay link failed: ${err.message}`))
  }

  private onFrame(text: string): void {
    let frame: unknown
    try {
      frame = JSON.parse(text)
    } catch {
      return
    }
    if (typeof frame !== 'object' || frame === null) return
    const f = frame as Record<string, unknown>
    if (f.type === 'relay.answer') {
      if (typeof f.askId === 'string') this.pending.get(f.askId)?.(f.stands === true)
      return
    }
    if (f.type === 'relay.revoke') {
      const revoke = readRevoke(f)
      if (revoke) this.options.onRevoke?.(revoke)
      else this.options.log('dropped a revocation from hq that it could not read')
      return
    }
    if (f.type !== 'relay.welcome') {
      // An order needs to know which relay it is for, so none is taken before hq has named this one.
      if (this.id !== null) this.options.onOrder?.(f)
      return
    }
    if (!checkProtocolCompatibility(RELAY_PROTOCOL_VERSION, typeof f.version === 'string' ? f.version : null).ok) return
    if (typeof f.relayId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(f.relayId)) return
    if (this.id !== null && this.id !== f.relayId) {
      // The passes the lines were opened with name the old id.
      this.options.lines.closeAll(RELAY_CHANGED_CLOSE_CODE, 'hq named this relay anew')
    }
    if (this.id !== f.relayId) this.options.log(`hq named this relay ${f.relayId}`)
    this.id = f.relayId
  }

  /** One frame to hq, when the link is up; dropped otherwise (a bundle's end is reported by its destination too). */
  send(frame: object): void {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
  }

  private report(): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { load, lines, appLoad, refusals } = this.options
    const appRefusals = refusals?.drain() ?? []
    const frame: RelayLinkReport = {
      type: 'relay.report',
      version: RELAY_PROTOCOL_VERSION,
      startedAt: load.startedAt.toISOString(),
      sites: lines.sites(),
      openStreams: load.openStreams + (appLoad?.openStreams ?? 0),
      bytesCarried: load.bytesCarried + (appLoad?.bytesCarried ?? 0),
      ...(appRefusals.length ? { appRefusals } : {}),
    }
    ws.send(JSON.stringify(frame))
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private clearTimers(): void {
    if (this.reportTimer) clearInterval(this.reportTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.reportTimer = null
    this.pingTimer = null
  }

  /** Logged once until it changes, so a relay retrying every minute does not fill its log with the same line. */
  private problem(line: string): void {
    if (line === this.lastProblem) return
    this.lastProblem = line
    this.options.log(line)
  }
}
