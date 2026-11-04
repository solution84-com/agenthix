import WebSocket from 'ws'
import { StreamMux, HQ_SITE_REPLACED_HEADER, SITE_SILENCE_TIMEOUT_MS } from '@agenthix/core'
import { isUnknownSite, siteDialOptions, statedHqVersion } from '../hqAnswers'
import { ContentStream } from './contentStream'
import { contentMethods, type ContentHandler } from './contentMethods'
import { Logger } from '../../utils/logger'

const logger = new Logger('ContentConnection')

const RECONNECT_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 60_000

export type ContentConnectionOptions = {
  url: string
  token: string
  siteId: string
  methods?: Readonly<Record<string, ContentHandler>>
  /** hq refused this site's protocol version, stating its own (undefined when it stated none). */
  onVersionMismatch?(stated: string | undefined): void
  /** How long the socket may hear nothing from hq before it is treated as dead. */
  silenceTimeoutMs?: number
}

/**
 * The site's end of the content transport (ADR-0063): a second outbound
 * socket beside the control channel, so a site still listens on nothing.
 *
 * hq opens streams and this answers them from a closed registry. A site never
 * opens a stream toward hq — its calls to hq stay on ordinary HTTPS.
 */
export class ContentConnection {
  private ws: WebSocket | null = null
  private mux: StreamMux | null = null
  private reconnectDelay = RECONNECT_DELAY_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private readonly methods: Readonly<Record<string, ContentHandler>>

  constructor(private readonly options: ContentConnectionOptions) {
    this.methods = options.methods ?? contentMethods
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearSilenceTimer()
    this.mux?.closeAll('disconnected', 'Content connection stopped')
    this.ws?.close()
    this.ws = null
    this.mux = null
  }

  private connect(): void {
    if (this.stopped || this.ws) return
    const ws = new WebSocket(this.options.url, siteDialOptions(this.options.token, this.options.siteId))
    this.ws = ws

    const mux = new StreamMux('server', {
      sendText: text => {
        if (ws.readyState === WebSocket.OPEN) ws.send(text)
      },
      sendBinary: bytes =>
        new Promise((resolve, reject) => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error('Content connection is not open'))
            return
          }
          ws.send(bytes, err => (err ? reject(err) : resolve()))
        }),
    })
    mux.onOpen = (id, method, params) => this.serve(mux, id, method, params)
    this.mux = mux

    // A 426 is not a network failure: hq is up and refusing this version.
    // Say so, and retry at the slowest pace — hq may be upgraded under us.
    ws.on('unexpected-response', (_req, res) => {
      if (res.statusCode === 426) {
        this.options.onVersionMismatch?.(statedHqVersion(res.headers))
        this.reconnectDelay = MAX_RECONNECT_DELAY_MS
      }
      // hq has no record of this site: no retry can succeed. The control
      // channel says so to the operator and stops this too; stopping here as
      // well means it does not depend on that arriving.
      if (isUnknownSite(res.statusCode ?? 0, res.headers)) {
        this.stopped = true
        logger.error('hq does not recognise this site — content transport will not retry')
      }
      // A restore onto another machine replaced this copy (adr-0119): likewise final.
      if (res.statusCode === 401 && res.headers[HQ_SITE_REPLACED_HEADER.toLowerCase()] !== undefined) {
        this.stopped = true
        logger.error('hq refuses this copy of the site, which a restore replaced — content transport will not retry')
      }
      res.resume()
      ws.terminate()
    })

    ws.on('open', () => {
      this.reconnectDelay = RECONNECT_DELAY_MS
      this.armSilenceTimer(ws)
      logger.info(`Content transport connected to ${this.options.url}`)
    })

    // hq pings on a schedule, so hearing nothing at all means the path is dead
    // even though this socket still reads as open.
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
      mux.closeAll('disconnected', 'Content connection closed')
      if (this.ws === ws) {
        this.clearSilenceTimer()
        this.ws = null
        this.mux = null
      }
      this.scheduleReconnect()
    })

    ws.on('error', err => logger.warn(`Content transport error: ${err.message}`))
  }

  private serve(mux: StreamMux, id: number, method: string, params: unknown): void {
    const handler = Object.prototype.hasOwnProperty.call(this.methods, method) ? this.methods[method] : undefined
    if (!handler) {
      mux.fail(id, 'unknown_method', `Unknown method: ${method}`)
      return
    }
    const { stream, events } = ContentStream.attach(mux, id)
    mux.accept(id, events)
    // Through a promise, so a handler that throws synchronously is reported
    // the same way as one that rejects, rather than thrown out of the socket's
    // 'message' listener.
    Promise.resolve()
      .then(() => handler(stream, params))
      .catch(err => {
        // The message, not the stack: hq logs this and an operator reads it there.
        mux.fail(id, 'handler_failed', err instanceof Error ? err.message : 'Handler failed')
        stream.destroy()
      })
  }

  private armSilenceTimer(ws: WebSocket): void {
    if (this.ws !== ws) return
    this.clearSilenceTimer()
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null
      if (this.ws !== ws) return
      logger.warn(`Content transport heard nothing from hq for ${this.silenceTimeoutMs}ms — reconnecting`)
      ws.terminate()
    }, this.silenceTimeoutMs)
    this.silenceTimer.unref?.()
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  private get silenceTimeoutMs(): number {
    return this.options.silenceTimeoutMs ?? SITE_SILENCE_TIMEOUT_MS
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
