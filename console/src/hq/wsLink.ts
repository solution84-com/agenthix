/**
 * The console link (C8): one websocket the Fleet Console dials to hq's `/console-link` and keeps open, reconnecting
 * when it drops. Nothing dials the console. Requests pair with answers by id, as on the site channel; hq's unasked
 * frames — relayed envelopes, joins and presence — go to the listeners, which check them, since hq is not trusted
 * with anything the envelopes or the join's bindings protect.
 */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import {
  HOST_PROTOCOL_VERSION, HOST_PROTOCOL_VERSION_HEADER, HQ_CONSOLE_CODE_HEADER, peerRefusalMessage,
  type HostEnvelope, type ConsoleLinkMethod, type ConsoleLinkMethods, type RelayUndeliverableReason,
} from '@agenthix/core'
import type { HqCredentials } from './credentials'
import { HqCallError, HqUnavailableError, LinkListeners, type HandoverFrame, type HqLink, type LinkEvents, type LinkState } from './link'

const RECONNECT_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 60_000
const CALL_TIMEOUT_MS = 15_000
const PING_EVERY_MS = 30_000
const SILENCE_TIMEOUT_MS = 3 * PING_EVERY_MS
/** An envelope is at most about 1.4 MB on the wire; anything far larger is not a frame hq should send. */
const MAX_FRAME_BYTES = 4 * 1024 * 1024

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export type WsHqLinkOptions = {
  url: string
  credentials: HqCredentials
  callTimeoutMs?: number
  log?: (line: string) => void
}

export class WsHqLink implements HqLink {
  private ws: WebSocket | null = null
  private current: LinkState = 'disconnected'
  private readonly listeners = new LinkListeners()
  private readonly pending = new Map<string, Pending>()
  private reconnectDelay = RECONNECT_DELAY_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  /** Why hq refused the last connection, in words for the logs. */
  lastProblem: string | null = null
  /** On a handover code's connection: the new console said it holds the machines, so a credential may come. */
  private handoverDoneSent = false
  /**
   * No connection of this process has been usable yet. hq is told so on the first, and ends the joins an earlier
   * start opened, whose codes lived in that one's memory (join/joins.ts); on a reconnection the joins are still held.
   */
  private firstConnection = true

  constructor(private options: WsHqLinkOptions) {}

  get state(): LinkState {
    return this.current
  }

  on<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): void {
    this.listeners.on(event, listener)
  }

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.dropped()
  }

  /** Dials another address from now on: hq moved there and it passed the move check (addressFollow.ts). */
  redial(url: string): void {
    this.options = { ...this.options, url }
    this.reconnectDelay = RECONNECT_DELAY_MS
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const old = this.ws
    if (old) {
      // Forgotten first, so its close is not taken for this link's.
      this.ws = null
      this.dropped()
      old.close()
    }
    if (!this.stopped) this.connect()
  }

  call<M extends ConsoleLinkMethod>(method: M, params: ConsoleLinkMethods[M]['params']): Promise<ConsoleLinkMethods[M]['result']> {
    const ws = this.ws
    if (!ws || this.current !== 'connected') return Promise.reject(new HqUnavailableError())
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new HqUnavailableError('HQ did not answer in time.'))
      }, this.options.callTimeoutMs ?? CALL_TIMEOUT_MS)
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.send({ type: 'console.request', requestId, payload: { method, params } })
    })
  }

  sendEnvelope(envelope: HostEnvelope): void {
    if (this.current !== 'connected') throw new HqUnavailableError()
    this.send({ type: 'relay.envelope', payload: { envelope } })
  }

  sendHandover(type: HandoverFrame, payload: unknown): void {
    if (type === 'console.handoverDone') this.handoverDoneSent = true
    this.send({ type, payload })
  }

  private connect(): void {
    if (this.stopped || this.ws) return
    const proof = this.options.credentials.current()
    if (!proof) {
      this.setState('refused')
      this.lastProblem = 'The Fleet Console holds no credential for hq: set the pairing secret, or install it with a new one-time code.'
      this.log(this.lastProblem)
      return
    }
    const headers: Record<string, string> = {
      [HOST_PROTOCOL_VERSION_HEADER]: HOST_PROTOCOL_VERSION,
      ...(proof.kind === 'bearer' ? { Authorization: `Bearer ${proof.value}` } : { [HQ_CONSOLE_CODE_HEADER]: proof.lookup }),
    }
    const redeeming = proof.kind === 'code'
    const handover = proof.kind === 'code' && proof.handover
    this.handoverDoneSent = false
    this.setState('connecting')
    const ws = new WebSocket(this.options.url, { headers, maxPayload: MAX_FRAME_BYTES, followRedirects: false })
    this.ws = ws

    ws.on('unexpected-response', (_req, res) => {
      if (this.ws !== ws) return
      res.resume()
      if (res.statusCode === 426) {
        this.setState('versionMismatch')
        const stated = res.headers[HOST_PROTOCOL_VERSION_HEADER.toLowerCase()]
        this.lastProblem = peerRefusalMessage(HOST_PROTOCOL_VERSION, Array.isArray(stated) ? stated[0] : stated, { own: 'the Fleet Console', peer: 'HQ' })
        this.reconnectDelay = MAX_RECONNECT_DELAY_MS
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        this.setState('refused')
        this.lastProblem = redeeming
          ? "hq refused the one-time code: it is wrong, used or expired. On hq's machine, make a new one and install the Fleet Console again."
          : 'hq refused the Fleet Console\'s credential. It may have been retired by a Fleet Console installed elsewhere.'
        this.reconnectDelay = MAX_RECONNECT_DELAY_MS
        // A code works once: trying it again cannot help.
        if (redeeming) this.stopped = true
      } else {
        this.lastProblem = `hq refused the connection (HTTP ${res.statusCode}).`
      }
      this.log(this.lastProblem)
      ws.terminate()
    })

    ws.on('open', () => {
      if (this.ws !== ws) return
      this.reconnectDelay = RECONNECT_DELAY_MS
      this.lastProblem = null
      this.armSilence(ws)
      this.pingTimer = setInterval(() => this.send({ type: 'ping', payload: {} }), PING_EVERY_MS)
      this.pingTimer.unref?.()
      // A connection opened with a code is not usable until hq has sent the credential it bought; a handover code's
      // first needs the running Fleet Console's answer.
      if (!redeeming) this.connected()
      else this.listeners.emit('redeemOpen')
    })

    ws.on('message', raw => {
      if (this.ws !== ws) return
      this.armSilence(ws)
      let frame: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(raw.toString())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
        frame = parsed as Record<string, unknown>
      } catch {
        return
      }
      if (frame.type === 'console.credential' && redeeming && this.current === 'connecting') {
        if (handover && !this.handoverDoneSent) return this.notHandedOver(ws)
        this.redeemed(ws, frame.payload, handover)
        return
      }
      // Only for a handover code, which hq never saw: hq made a fresh code, so it could make up an answer that proves it.
      if (frame.type === 'console.handover' && handover && this.current === 'connecting') {
        this.listeners.emit('handover', frame.payload)
        return
      }
      if (this.current !== 'connected') return
      this.handle(frame)
    })

    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      this.dropped()
      if (!this.stopped) this.scheduleReconnect()
    })

    ws.on('error', err => {
      if (this.ws !== ws) return
      this.log(`hq link: ${err.message}`)
    })
  }

  /** hq answered a handover code as one it made: the credential is not kept, and nothing is tried again. */
  private notHandedOver(ws: WebSocket): void {
    this.lastProblem = 'hq gave a credential for the handover code without the machines, so the move did not happen.'
    this.log(this.lastProblem)
    this.stopped = true
    this.setState('refused')
    this.listeners.emit('notHandedOver')
    ws.close()
  }

  private redeemed(ws: WebSocket, payload: unknown, handover: boolean): void {
    const credential = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).credential : undefined
    try {
      this.options.credentials.saveRedeemed(credential)
    } catch (err) {
      this.lastProblem = err instanceof Error ? err.message : 'The credential hq sent could not be kept.'
      this.log(this.lastProblem)
      this.stopped = true
      ws.close()
      return
    }
    this.log('hq accepted the one-time code; the Fleet Console keeps its credential from now on.')
    // The move is done only once hq hears the credential is kept; until then the running Fleet Console stays.
    if (handover) this.send({ type: 'console.handoverAck', payload: {} })
    this.connected()
  }

  /** Usable now: hq hears first whether this Fleet Console has just started, before anything it asks. */
  private connected(): void {
    this.send({ type: 'console.hello', payload: { started: this.firstConnection } })
    this.firstConnection = false
    this.setState('connected')
  }

  private handle(frame: Record<string, unknown>): void {
    const payload = frame.payload
    switch (frame.type) {
      case 'ping':
        this.send({ type: 'pong', payload: {}, replyTo: typeof frame.requestId === 'string' ? frame.requestId : undefined })
        return
      case 'console.response':
      case 'console.error': {
        const pending = typeof frame.replyTo === 'string' ? this.pending.get(frame.replyTo) : undefined
        if (!pending) return
        this.pending.delete(frame.replyTo as string)
        clearTimeout(pending.timer)
        if (frame.type === 'console.response') pending.resolve(payload)
        else {
          const p = (payload ?? {}) as Record<string, unknown>
          pending.reject(new HqCallError(
            typeof p.code === 'string' ? (p.code as HqCallError['code']) : 'failed',
            typeof p.message === 'string' ? p.message : 'hq refused the request.',
          ))
        }
        return
      }
      case 'relay.envelope':
        this.listeners.emit('envelope', (payload as Record<string, unknown> | undefined)?.envelope)
        return
      case 'relay.undeliverable': {
        const p = (payload ?? {}) as Record<string, unknown>
        if (typeof p.envelopeId === 'string' && typeof p.reason === 'string') {
          this.listeners.emit('undeliverable', p.envelopeId, p.reason as RelayUndeliverableReason)
        }
        return
      }
      case 'join.request':
        this.listeners.emit('joinRequest', payload)
        return
      case 'host.presence':
        this.listeners.emit('presence', payload)
        return
      case 'console.handoverRequest':
        this.listeners.emit('handoverRequest', payload)
        return
      case 'hq.address':
        this.listeners.emit('hqAddress', (payload as Record<string, unknown> | undefined)?.address)
        return
      case 'fleetAdmin.removed':
        this.listeners.emit('fleetAdminRemoved', (payload as Record<string, unknown> | undefined)?.userId)
        return
    }
  }

  private send(frame: { type: string; payload: unknown; requestId?: string; replyTo?: string }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ version: HOST_PROTOCOL_VERSION, ...frame }))
  }

  private armSilence(ws: WebSocket): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = setTimeout(() => {
      if (this.ws === ws) {
        this.log(`heard nothing from hq for ${SILENCE_TIMEOUT_MS / 1000} s; reconnecting`)
        ws.terminate()
      }
    }, SILENCE_TIMEOUT_MS)
    this.silenceTimer.unref?.()
  }

  private dropped(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.pingTimer = null
    this.silenceTimer = null
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new HqUnavailableError())
      this.pending.delete(id)
    }
    if (this.current !== 'refused' && this.current !== 'versionMismatch') this.setState('disconnected')
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectTimer.unref?.()
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }

  private setState(state: LinkState): void {
    if (this.current === state) return
    this.current = state
    this.listeners.emit('state', state)
  }

  private log(line: string): void {
    ;(this.options.log ?? (l => console.log(`[console] ${l}`)))(line)
  }
}
