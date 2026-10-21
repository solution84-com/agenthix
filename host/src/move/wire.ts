/**
 * How a move reaches the other machine and the Fleet Console: the host link (link/link.ts) carries a transfer's frames
 * to and from hq's relay, and envelopes to the pinned Fleet Console. Registered once by main.ts, per state folder as the
 * other per-machine registries are, so tests wire two machines to each other without a link.
 */
import type { HostMessage } from '@agenthix/core'
import type { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import type { Context } from '../service/context'

export type TransferFrameType = 'transfer.chunk' | 'transfer.ack' | 'transfer.envelope'

export type TransferWire = {
  /** False when the link is not up: nothing was sent. */
  send(type: TransferFrameType, payload: unknown): boolean
  /** Sealed to the pinned Fleet Console and sent; nothing when none is pinned or the link is down. */
  toConsole(message: HostMessage): Promise<void>
  /** The ids of the envelopes the other machine sent, so none is taken twice; made when the service started. */
  replay: EnvelopeReplayGuard
}

type Listener = (type: string, payload: Record<string, unknown>) => void

const wires = new Map<string, TransferWire>()
const listeners = new Map<string, Map<string, Listener>>()
const fallbacks = new Map<string, (type: string, payload: Record<string, unknown>) => void>()

export function setTransferWire(ctx: Context, wire: TransferWire): void {
  wires.set(ctx.state.root, wire)
}

export function wireOf(ctx: Context): TransferWire | null {
  return wires.get(ctx.state.root) ?? null
}

/** Hears one transfer's frames until the returned function is called. */
export function listen(ctx: Context, transferId: string, listener: Listener): () => void {
  const mine = listeners.get(ctx.state.root) ?? new Map<string, Listener>()
  listeners.set(ctx.state.root, mine)
  mine.set(transferId, listener)
  return () => {
    if (mine.get(transferId) === listener) mine.delete(transferId)
  }
}

/** Who hears a transfer's frames that nobody listens to yet: the receiving side, waiting for its first chunk. */
export function onUnheard(ctx: Context, handler: (type: string, payload: Record<string, unknown>) => void): void {
  fallbacks.set(ctx.state.root, handler)
}

/** A frame from the link, to whoever listens for its transfer. */
export function deliver(ctx: Context, type: string, payload: Record<string, unknown>): void {
  const transferId = typeof payload.transferId === 'string' ? payload.transferId : null
  if (!transferId) return
  const listener = listeners.get(ctx.state.root)?.get(transferId)
  if (listener) listener(type, payload)
  else fallbacks.get(ctx.state.root)?.(type, payload)
}
