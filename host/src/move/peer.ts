/**
 * One side's view of a move's transfer (core's transfer.ts): the steps it seals to the other machine and the ones it
 * opens from it — only from the identity the Fleet Console named in its signed `move` request, never twice — the
 * receiver's acknowledgements, and hq dropping the transfer. Chunks are passed to whoever takes them, still unchecked.
 */
import {
  parseTransferChunk, parseTransferStep,
  type HostIdentity, type TransferChunk, type TransferClosedReason, type TransferStep,
} from '@agenthix/core'
import { openEnvelope, sealEnvelope, type HostKeys } from '@agenthix/core/host-crypto'
import type { Context } from '../service/context'
import { listen, wireOf, type TransferWire } from './wire'

/** A step lives this long: a late one is refused rather than acted on (the deadlines in send.ts count on it). */
export const STEP_LIFETIME_MS = 60_000

const CLOCK_CHECK_MS = 200

type Waiter<T> = { accept: (v: T) => boolean; resolve: (v: T | null) => void }

export class PeerChannel {
  private readonly steps: TransferStep[] = []
  private stepWaiters: Waiter<TransferStep>[] = []
  private acked = -1
  private ackWaiters: Waiter<number>[] = []
  private stopListening: (() => void) | null = null
  /** Frames are taken in the order hq passed them: a drop of the transfer never overtakes a step still being opened. */
  private inbox: Promise<void> = Promise.resolve()
  closed: TransferClosedReason | null = null
  /**
   * Whether hq dropping the transfer ends the waits. hq's own move (hqSend.ts, hqReceive.ts) turns it off once hq has
   * left the old machine: what that hq said of the transfer no longer counts, and the deadlines bound the rest.
   */
  closedCounts = true
  /** The other machine said the move ends (`failed`, `gaveBack`, `abort`): why. Nothing waits on it any longer. */
  peerEnded: string | null = null
  /** Every frame hq passed for this transfer; a sender waits on the receiver by it. */
  lastHeard: number
  onChunk: ((chunk: TransferChunk) => void) | null = null

  constructor(
    private readonly ctx: Context,
    readonly transferId: string,
    readonly keys: HostKeys,
    readonly own: string,
    readonly peer: string,
    readonly peerIdentity: HostIdentity,
  ) {
    this.lastHeard = ctx.now().getTime()
  }

  get wire(): TransferWire {
    const wire = wireOf(this.ctx)
    if (!wire) throw new Error('This host service has no link to HQ to move the site over.')
    return wire
  }

  start(): this {
    this.stopListening = listen(this.ctx, this.transferId, (type, payload) => {
      this.lastHeard = this.ctx.now().getTime()
      this.inbox = this.inbox.then(() => this.heard(type, payload)).catch(() => {})
    })
    return this
  }

  stop(): void {
    this.stopListening?.()
    this.stopListening = null
    this.fail()
  }

  /** Sealed to the other machine and signed; false when the link is down and nothing went. */
  async send(step: TransferStep): Promise<boolean> {
    const envelope = await sealEnvelope({
      sender: this.keys, recipient: this.peerIdentity, now: this.ctx.now().getTime(), lifetimeMs: STEP_LIFETIME_MS,
      message: { kind: 'transfer', transferId: this.transferId, step },
    })
    return this.wire.send('transfer.envelope', { transferId: this.transferId, envelope })
  }

  /** From here on, only the deadlines end a wait (see `closedCounts`). */
  outlastHq(): void {
    this.closedCounts = false
    this.closed = null
  }

  ack(seq: number): void {
    this.wire.send('transfer.ack', { transferId: this.transferId, seq })
  }

  /** The next step `accept` takes, in the order they came; null when hq dropped the transfer or `until` passed. */
  nextStep(until: number, accept: (s: TransferStep) => boolean = () => true): Promise<TransferStep | null> {
    const i = this.steps.findIndex(accept)
    if (i >= 0) return Promise.resolve(this.steps.splice(i, 1)[0])
    if (this.closed) return Promise.resolve(null)
    return this.wait(this.stepWaiters, accept, until, w => { this.stepWaiters = this.stepWaiters.filter(x => x !== w) })
  }

  /** Whether the receiver has acknowledged chunk `seq`, by `until`. */
  async acknowledged(seq: number, until: number): Promise<boolean> {
    if (this.acked >= seq) return true
    if (this.closed || this.peerEnded) return false
    return (await this.wait(this.ackWaiters, n => n >= seq, until, w => { this.ackWaiters = this.ackWaiters.filter(x => x !== w) })) !== null
  }

  /** Ends at `until` by the service's own clock, looked at every so often rather than trusted to one long timer. */
  private wait<T>(list: Waiter<T>[], accept: (v: T) => boolean, until: number, remove: (w: Waiter<T>) => void): Promise<T | null> {
    return new Promise(resolve => {
      const waiter: Waiter<T> = { accept, resolve: v => { clearInterval(timer); remove(waiter); resolve(v) } }
      const timer = setInterval(() => {
        if (this.ctx.now().getTime() >= until) waiter.resolve(null)
      }, CLOCK_CHECK_MS)
      list.push(waiter)
      if (this.ctx.now().getTime() >= until) waiter.resolve(null)
    })
  }

  private async heard(type: string, payload: Record<string, unknown>): Promise<void> {
    if (type === 'transfer.closed') {
      if (!this.closedCounts) return
      this.closed = (typeof payload.reason === 'string' ? payload.reason : 'closed') as TransferClosedReason
      return this.fail()
    }
    if (type === 'transfer.ack') {
      const seq = payload.seq
      if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq <= this.acked) return
      this.acked = seq
      for (const w of [...this.ackWaiters]) if (w.accept(seq)) w.resolve(seq)
      return
    }
    if (type === 'transfer.chunk') {
      const chunk = parseTransferChunk(payload)
      if (chunk && this.onChunk) this.onChunk(chunk)
      return
    }
    if (type !== 'transfer.envelope') return
    const opened = await openEnvelope(payload.envelope, {
      recipient: this.keys,
      // Only the machine the Fleet Console named: not hq, not the Fleet Console, not any other machine.
      pinned: fp => (fp === this.peer ? this.peerIdentity : null),
      replay: this.wire.replay,
      now: this.ctx.now().getTime(),
    })
    if (!opened.ok) return
    const message = opened.message as { kind?: unknown; transferId?: unknown; step?: unknown } | null
    if (message?.kind !== 'transfer' || message.transferId !== this.transferId) return
    const step = parseTransferStep(message.step)
    if (!step) return
    if (step.step === 'failed' || step.step === 'gaveBack' || step.step === 'abort') {
      this.peerEnded = step.reason
      for (const w of [...this.ackWaiters]) w.resolve(null)
    }
    const waiter = this.stepWaiters.find(w => w.accept(step))
    if (waiter) waiter.resolve(step)
    else this.steps.push(step)
  }

  private fail(): void {
    for (const w of [...this.stepWaiters]) w.resolve(null)
    for (const w of [...this.ackWaiters]) w.resolve(null)
  }
}
