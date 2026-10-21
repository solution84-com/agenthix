/**
 * The machine's link to Agenthix Cloud (pre-release spec B2): one outward connection to Cloud's `/host-link`, kept open
 * while the machine is enrolled and opened again with growing waits when it drops. It never passes through hq, so it
 * keeps working while hq is down. It is opened with the machine id alone — no bearer secret — and does nothing until
 * Cloud's first frame, which must be a fresh envelope, never seen before, from the Cloud identity the machine pinned
 * (`envelopes.ts`). Any other first frame, or none in time, closes it.
 */
import { HOST_ID_HEADER, HOST_PROTOCOL_VERSION, HOST_PROTOCOL_VERSION_HEADER, type HostEnvelope } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import { frame, parseFrame } from '../link/frames'
import { hostLinkUrl, type Dial, type LinkSocket } from '../link/socket'
import { readCloudBinding } from '../link/cloudController'

const FIRST_WAIT_MS = 1_000
const LONGEST_WAIT_MS = 60_000
const PING_EVERY_MS = 30_000
const SILENT_MS = 90_000
/** How long Cloud has to prove itself once the connection opens. */
const FIRST_FRAME_MS = 30_000

export type CloudLinkDeps = {
  state: StateFolder
  dial: Dial
  cloudUrl: string
  /** Opens one envelope; true when it was a fresh one from the pinned Cloud identity. */
  onEnvelope: (envelope: unknown) => Promise<boolean>
  log: (line: string) => void
  now?: () => number
  random?: () => number
  firstFrameMs?: number
}

export class CloudLink {
  private socket: LinkSocket | null = null
  private proven = false
  private running = false
  private attempt = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private firstFrame: ReturnType<typeof setTimeout> | null = null
  private lastHeard = 0
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly d: CloudLinkDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** Opens the link if the machine is enrolled with Cloud; does nothing if it is already running. */
  start(): void {
    if (this.running) return
    this.running = true
    this.attempt = 0
    this.connect()
  }

  stop(): void {
    this.running = false
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.closeSocket()
  }

  /** Open, and Cloud has proved itself on it. */
  connected(): boolean {
    return this.proven
  }

  sendEnvelope(envelope: HostEnvelope): void {
    if (this.proven) this.socket?.send(frame('relay.envelope', { envelope }))
  }

  private closeSocket(): void {
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    this.proven = false
    socket?.close()
  }

  private clearTimers(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.firstFrame) clearTimeout(this.firstFrame)
    this.heartbeat = null
    this.firstFrame = null
  }

  private connect(): void {
    const binding = readCloudBinding(this.d.state)
    if (!binding) {
      this.running = false
      return
    }
    const headers = { [HOST_PROTOCOL_VERSION_HEADER]: HOST_PROTOCOL_VERSION, [HOST_ID_HEADER]: binding.machineId }
    const socket: LinkSocket = this.d.dial(hostLinkUrl(this.d.cloudUrl), headers, {
      open: () => {
        if (this.socket !== socket) return
        this.firstFrame = setTimeout(() => {
          this.d.log('Cloud\'s link was closed: Cloud sent no envelope to prove itself in time.')
          socket.close()
        }, this.d.firstFrameMs ?? FIRST_FRAME_MS)
      },
      message: text => {
        if (this.socket !== socket) return
        this.queue = this.queue.then(() => this.handle(socket, text))
      },
      close: () => {
        if (this.socket !== socket) return
        this.socket = null
        this.proven = false
        this.clearTimers()
        if (this.running) this.later()
      },
    })
    this.socket = socket
  }

  private async handle(socket: LinkSocket, text: string): Promise<void> {
    if (this.socket !== socket) return
    const f = parseFrame(text)
    if (!this.proven) {
      const ok = f?.type === 'relay.envelope' && (await this.d.onEnvelope(f.payload.envelope))
      if (this.socket !== socket) return
      if (!ok) {
        this.d.log('Cloud\'s link was closed: its first frame was not a fresh envelope from the Cloud identity this machine pinned.')
        socket.close()
        return
      }
      this.proven = true
      this.attempt = 0
      if (this.firstFrame) clearTimeout(this.firstFrame)
      this.firstFrame = null
      this.lastHeard = this.now()
      this.heartbeat = setInterval(() => this.beat(socket), PING_EVERY_MS)
      return
    }
    this.lastHeard = this.now()
    if (!f) return
    if (f.type === 'ping') socket.send(frame('pong', {}))
    else if (f.type === 'relay.envelope') await this.d.onEnvelope(f.payload.envelope)
  }

  private beat(socket: LinkSocket): void {
    if (this.now() - this.lastHeard > SILENT_MS) socket.close()
    else socket.send(frame('ping', {}))
  }

  private later(): void {
    const wait = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** this.attempt)
    this.attempt = Math.min(this.attempt + 1, 10)
    this.retry = setTimeout(() => {
      this.retry = null
      if (this.running) this.connect()
    }, Math.round(wait * (0.5 + (this.d.random ?? Math.random)() / 2)))
  }
}
