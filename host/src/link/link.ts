/**
 * The machine's link to HQ's relay (host-management spec §4 C3, §6 step 4): one outward connection, opened with the
 * machine credential, kept open while a Fleet Console is pinned and opened again with growing waits when it drops.
 * It accepts nothing inbound: HQ passes envelopes along it, and every one is checked by `envelopes.ts` before
 * anything acts. `revoke` from HQ, like `console disconnect`, forgets the pin. A handover certificate moves the pin
 * when the pinned Fleet Console signed it (handover.ts).
 */
import type { HostEnvelope, RelayUndeliverableReason } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import { frame, parseFrame } from './frames'
import { hostKeys } from '../identity/identity'
import { followHandover } from './handover'
import { handoverCodeUndeliverable } from './askCode'
import { readPin } from './pin'
import { hostLinkUrl, type Dial, type LinkSocket } from './socket'

const FIRST_WAIT_MS = 1_000
const LONGEST_WAIT_MS = 60_000
const PING_EVERY_MS = 30_000
/** Nothing heard for this long: the connection is taken as dead and opened again. */
const SILENT_MS = 90_000

export type LinkDeps = {
  state: StateFolder
  dial: Dial
  onEnvelope: (envelope: unknown) => Promise<void>
  onRevoke: () => Promise<void>
  /** hq moves to a new address (addressFollow.ts): the machine follows once the address passes the move check. */
  onHqAddress?: (address: unknown) => void
  /** The address hq sees this connection from (`hq.seenFrom`): live previews are kept from it when it is public. */
  onSeenFrom?: (address: unknown) => void
  /** A site's move: a transfer's frames from the other machine, or hq dropping it (move/wire.ts). */
  onTransfer?: (type: string, payload: Record<string, unknown>) => void
  log: (line: string) => void
  now?: () => number
  random?: () => number
}

export type LinkHandle = {
  start: () => void
  stop: () => void
  connected: () => boolean
  /** Sends what the host service itself asks its Fleet Console (askCode.ts); dropped when the link is down. */
  sendEnvelope: (envelope: HostEnvelope) => void
}

export class HostLink implements LinkHandle {
  private socket: LinkSocket | null = null
  private isOpen = false
  private running = false
  private attempt = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private lastHeard = 0

  constructor(private readonly d: LinkDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** Opens the link if a Fleet Console is pinned; does nothing if it is already running. */
  start(): void {
    if (this.running) return
    this.running = true
    this.attempt = 0
    this.connect()
  }

  stop(): void {
    this.running = false
    if (this.retry) clearTimeout(this.retry)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.retry = null
    this.heartbeat = null
    const socket = this.socket
    this.socket = null
    this.isOpen = false
    socket?.close()
  }

  connected(): boolean {
    return this.isOpen
  }

  sendEnvelope(envelope: HostEnvelope): void {
    if (this.isOpen) this.socket?.send(frame('relay.envelope', { envelope }))
  }

  /** Everything sent has left this process (stopping.ts waits for it at the stop signal). */
  drained(): boolean {
    return this.socket?.drained?.() ?? true
  }

  /** A transfer's frame, for hq to pass to the other machine of a move; false when the link is not up. */
  sendTransfer(type: string, payload: unknown): boolean {
    if (!this.isOpen || !this.socket) return false
    this.socket.send(frame(type, payload))
    return true
  }

  private connect(): void {
    const pin = readPin(this.d.state)
    if (!pin) {
      this.running = false
      return
    }
    const socket: LinkSocket = this.d.dial(hostLinkUrl(pin.hqAddress), { Authorization: `Bearer ${pin.machineCredential}` }, {
      open: () => {
        if (this.socket !== socket) return
        this.isOpen = true
        this.attempt = 0
        this.lastHeard = this.now()
        this.heartbeat = setInterval(() => this.beat(socket), PING_EVERY_MS)
      },
      message: text => {
        if (this.socket !== socket || !this.isOpen) return
        this.lastHeard = this.now()
        this.handle(socket, text)
      },
      close: () => {
        if (this.socket !== socket) return
        this.socket = null
        this.isOpen = false
        if (this.heartbeat) clearInterval(this.heartbeat)
        this.heartbeat = null
        if (this.running) this.later()
      },
    })
    this.socket = socket
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

  private handle(socket: LinkSocket, text: string): void {
    const f = parseFrame(text)
    if (!f) return
    switch (f.type) {
      case 'ping':
        socket.send(frame('pong', {}))
        return
      case 'relay.envelope':
        void this.d.onEnvelope(f.payload.envelope)
        return
      case 'relay.undeliverable':
        this.d.log(`HQ could not pass an envelope on to the Fleet Console: ${String(f.payload.reason)}.`)
        handoverCodeUndeliverable(String(f.payload.envelopeId), String(f.payload.reason) as RelayUndeliverableReason)
        return
      case 'revoke':
        void this.d.onRevoke()
        return
      case 'hq.address':
        this.d.onHqAddress?.(f.payload.address)
        return
      case 'hq.seenFrom':
        this.d.onSeenFrom?.(f.payload.address)
        return
      case 'transfer.chunk':
      case 'transfer.ack':
      case 'transfer.envelope':
      case 'transfer.closed':
        this.d.onTransfer?.(f.type, f.payload)
        return
      case 'console.handover':
        void followHandover({
          state: this.d.state, keys: () => hostKeys(this.d.state), send: e => this.sendEnvelope(e),
          now: () => new Date(this.now()), log: this.d.log,
        }, f.payload.certificates).catch(err => this.d.log(`A handover could not be read: ${err instanceof Error ? err.message : String(err)}`))
        return
    }
  }
}
