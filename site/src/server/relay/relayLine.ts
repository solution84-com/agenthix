import WebSocket from 'ws'
import {
  CONTENT_LINK_MAX_MESSAGE_BYTES,
  RELAY_PROTOCOL_VERSION,
  RELAY_PROTOCOL_VERSION_HEADER,
  RELAY_SITE_ID_HEADER,
  SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER,
  SITE_SILENCE_TIMEOUT_MS,
  StreamMux,
} from '@agenthix/core'
import { ContentStream } from '../hq/content/contentStream'
import type { ContentHandler } from '../hq/content/contentMethods'
import { Logger } from '../utils/logger'

const logger = new Logger('RelayLine')

const RECONNECT_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 60_000
/** How long a retired line may keep carrying the streams it has open before it is closed regardless. */
const RETIRE_GRACE_MS = 10 * 60_000
const RETIRE_POLL_MS = 1_000

export type RelayLineOptions = {
  /** The relay's line address, resolved (`resolveLineUrl`); never logged with anything else in it. */
  url: string
  relayId: string
  siteId: string
  pass: string
  /** The streams this line serves. A relay is the opener; anything not listed is refused. */
  methods: Readonly<Record<string, ContentHandler>>
  /** Each time the line opens. */
  onUp?(): void
  silenceTimeoutMs?: number
  reconnectDelayMs?: number
}

/**
 * The site's line to its relay (adr-0153): a WebSocket the site dials, as it dials hq's content channel, so the site
 * still listens on nothing. The relay is the multiplexer's opener and the site its server.
 *
 * Built beside `ContentConnection` rather than on it: that class's dial headers and refusal handling are hq's (an
 * unknown or replaced site stops it for good), while a relay refusing a pass is answered by hq's next pass, so the line
 * keeps trying. What both share — the multiplexer and `ContentStream` — is reused.
 *
 * The pass is presented when the line is dialled. A renewed pass (`setPass`) is kept for the next dial; the open line
 * carries on, since the relay checked the pass when it took the line.
 */
export class RelayLine {
  private ws: WebSocket | null = null
  private mux: StreamMux | null = null
  private pass: string
  private reconnectDelay: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private retireTimer: ReturnType<typeof setInterval> | null = null
  private stopped = true

  constructor(private readonly options: RelayLineOptions) {
    this.pass = options.pass
    this.reconnectDelay = this.baseDelay
  }

  get relayId(): string {
    return this.options.relayId
  }

  get url(): string {
    return this.options.url
  }

  get isUp(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get openStreams(): number {
    return this.mux?.openStreamCount ?? 0
  }

  setPass(pass: string): void {
    this.pass = pass
  }

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.retireTimer) clearInterval(this.retireTimer)
    this.retireTimer = null
    this.clearSilenceTimer()
    this.mux?.closeAll('disconnected', 'Relay line stopped')
    this.ws?.close()
    this.ws = null
    this.mux = null
  }

  /**
   * No longer dialled again; closed once the streams it carries have finished (open files carry on through a move to
   * another relay), or after a grace period.
   */
  retire(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.openStreams === 0) return this.stop()
    const until = Date.now() + RETIRE_GRACE_MS
    this.retireTimer = setInterval(() => {
      if (this.openStreams === 0 || Date.now() >= until) this.stop()
    }, RETIRE_POLL_MS)
    this.retireTimer.unref?.()
  }

  private get baseDelay(): number {
    return this.options.reconnectDelayMs ?? RECONNECT_DELAY_MS
  }

  private connect(): void {
    if (this.stopped || this.ws) return
    const ws = new WebSocket(this.options.url, {
      headers: {
        Authorization: `Bearer ${this.pass}`,
        [RELAY_SITE_ID_HEADER]: this.options.siteId,
        [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION,
        [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION,
      },
      maxPayload: CONTENT_LINK_MAX_MESSAGE_BYTES,
    })
    this.ws = ws
    const mux = new StreamMux('server', {
      sendText: text => {
        if (ws.readyState === WebSocket.OPEN) ws.send(text)
      },
      sendBinary: bytes =>
        new Promise((resolve, reject) => {
          if (ws.readyState !== WebSocket.OPEN) return reject(new Error('Relay line is not open'))
          ws.send(bytes, err => (err ? reject(err) : resolve()))
        }),
    })
    mux.onOpen = (id, method, params) => this.serve(mux, id, method, params)
    this.mux = mux

    ws.on('unexpected-response', (_req, res) => {
      const status = res.statusCode ?? 0
      if (status === 426) {
        const stated = res.headers[RELAY_PROTOCOL_VERSION_HEADER.toLowerCase()]
        logger.error(`relay ${this.relayId} refused this site's protocol version (it speaks ${String(stated ?? 'another')}); retrying slowly`)
        this.reconnectDelay = MAX_RECONNECT_DELAY_MS
      } else if (status === 401 || status === 403) {
        // hq renews the pass before it ends; a refusal here is answered by the next one.
        logger.warn(`relay ${this.relayId} refused this site's pass (HTTP ${status}); retrying`)
      } else {
        logger.warn(`relay ${this.relayId} refused the line (HTTP ${status}); retrying`)
      }
      res.resume()
      ws.terminate()
    })

    ws.on('open', () => {
      if (this.ws !== ws) return
      this.reconnectDelay = this.baseDelay
      this.armSilenceTimer(ws)
      logger.info(`Line to relay ${this.relayId} is up`)
      this.options.onUp?.()
    })

    // The relay pings on a schedule, so hearing nothing means the path is dead though the socket reads as open.
    ws.on('ping', () => this.armSilenceTimer(ws))

    ws.on('message', (data, isBinary) => {
      this.armSilenceTimer(ws)
      if (isBinary) {
        const buf = data as Buffer
        mux.receiveBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      } else {
        mux.receiveText(data.toString())
      }
    })

    ws.on('close', () => {
      mux.closeAll('disconnected', 'Relay line closed')
      if (this.ws === ws) {
        this.clearSilenceTimer()
        this.ws = null
        this.mux = null
      }
      this.scheduleReconnect()
    })

    ws.on('error', err => logger.warn(`Relay line error: ${err.message}`))
  }

  private serve(mux: StreamMux, id: number, method: string, params: unknown): void {
    const handler = Object.prototype.hasOwnProperty.call(this.options.methods, method) ? this.options.methods[method] : undefined
    if (!handler) {
      mux.fail(id, 'unknown_method', `Unknown method: ${method}`)
      return
    }
    const { stream, events } = ContentStream.attach(mux, id)
    mux.accept(id, events)
    Promise.resolve()
      .then(() => handler(stream, params))
      .catch(err => {
        mux.fail(id, 'handler_failed', err instanceof Error ? err.message : 'Handler failed')
        stream.destroy()
      })
  }

  private armSilenceTimer(ws: WebSocket): void {
    if (this.ws !== ws) return
    this.clearSilenceTimer()
    const ms = this.options.silenceTimeoutMs ?? SITE_SILENCE_TIMEOUT_MS
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null
      if (this.ws !== ws) return
      logger.warn(`Relay line heard nothing from relay ${this.relayId} for ${ms}ms — reconnecting`)
      ws.terminate()
    }, ms)
    this.silenceTimer.unref?.()
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = null
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectTimer.unref?.()
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }
}
