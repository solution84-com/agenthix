/**
 * A site's move through hq's relay (host-management spec §13; core's transfer.ts): the old machine passes its sealed
 * backup to the new one in signed chunks, with the steps around it sealed between the two. hq reads none of it. It
 * passes a transfer's frames only between the two machines the Fleet Console opened it for, each unchanged, and drops
 * the transfer — telling both — when it grows past its size, goes faster than its pace, falls silent, outlives its
 * time, or either machine leaves once it has started. A transfer is spent by its one attempt: once dropped or closed
 * its id never opens again. Kept in memory: an hq restart drops what was under way, and the Fleet Console opens the
 * transfers it still waits on again when it reconnects.
 */
import type { WebSocket } from 'ws'
import {
  HOST_RELAY_MAX_FRAME_BYTES, HOST_TRANSFER_CHUNK_BYTES, HOST_TRANSFER_IDLE_MS, HOST_TRANSFER_MAX_BYTES,
  HOST_TRANSFER_MAX_BYTES_PER_SECOND, HOST_TRANSFER_MAX_OPEN_MS, HOST_TRANSFER_WINDOW,
  isTransferId, parseHostEnvelope, parseTransferChunk, type TransferClosedReason,
} from '@agenthix/core'
import { frame, send } from './frames'

/** A machine as the relay has it live now. */
export type LiveEnd = { ws: WebSocket; fingerprint: string }

type Route = {
  transferId: string
  from: string
  to: string
  expiresAt: number
  started: boolean
  bytes: number
  tokens: number
  refilledAt: number
  lastAt: number
  /**
   * The last steps of hq's own move (fleet/hqMove.ts), opened on the new machine by its host service: either machine
   * may be away a while as hq changes machines, so an absent one drops the frame rather than the transfer.
   */
  waits: boolean
}

const MAX_OPEN = 64
const MAX_SPENT = 1000
/** A burst the sender may run ahead of the pace by: its whole window, and half again. */
const BURST_BYTES = HOST_TRANSFER_CHUNK_BYTES * HOST_TRANSFER_WINDOW * 1.5

export type TransferFrameType = 'transfer.chunk' | 'transfer.ack' | 'transfer.envelope'

export function isTransferFrame(type: string): type is TransferFrameType {
  return type === 'transfer.chunk' || type === 'transfer.ack' || type === 'transfer.envelope'
}

export class TransferRoutes {
  private readonly routes = new Map<string, Route>()
  private readonly spent = new Set<string>()

  constructor(private readonly live: (hostId: string) => LiveEnd | null, private readonly now: () => number = Date.now) {}

  /** The Fleet Console lets `from` pass one transfer to `to`. False when it was spent, started, or too many are open. */
  open(p: { transferId: string; fromHostId: string; toHostId: string; expiresAt: Date; waitForEnds?: boolean }): boolean {
    if (!isTransferId(p.transferId) || p.fromHostId === p.toHostId || this.spent.has(p.transferId)) return false
    const expiresAt = Math.min(p.expiresAt.getTime(), this.now() + HOST_TRANSFER_MAX_OPEN_MS)
    if (expiresAt <= this.now()) return false
    const before = this.routes.get(p.transferId)
    if (before) {
      if (before.started || before.from !== p.fromHostId || before.to !== p.toHostId) return false
      before.expiresAt = expiresAt
      if (p.waitForEnds) before.waits = true
      return true
    }
    if (this.routes.size >= MAX_OPEN) return false
    this.routes.set(p.transferId, {
      transferId: p.transferId, from: p.fromHostId, to: p.toHostId, expiresAt,
      started: false, bytes: 0, tokens: BURST_BYTES, refilledAt: this.now(), lastAt: this.now(), waits: p.waitForEnds === true,
    })
    return true
  }

  /** Drops the transfer, telling whichever machine is live, and spends its id. */
  close(transferId: string, reason: TransferClosedReason = 'closed'): boolean {
    const route = this.routes.get(transferId)
    this.spend(transferId)
    if (!route) return false
    this.routes.delete(transferId)
    for (const hostId of [route.from, route.to]) {
      const end = this.live(hostId)
      if (end) send(end.ws, frame('transfer.closed', { transferId, reason }))
    }
    return true
  }

  /** A machine left: every transfer it had started with another is dropped. One not started yet keeps waiting. */
  hostLeft(hostId: string): void {
    for (const route of [...this.routes.values()]) {
      if (route.started && !route.waits && (route.from === hostId || route.to === hostId)) this.close(route.transferId, 'peer_left')
    }
  }

  /** Drops what outlived its time, or fell silent once started. hq's own clock; run every half minute or so. */
  sweep(): void {
    const now = this.now()
    for (const route of [...this.routes.values()]) {
      if (now >= route.expiresAt) this.close(route.transferId, 'expired')
      else if (route.started && now - route.lastAt > HOST_TRANSFER_IDLE_MS) this.close(route.transferId, 'idle')
    }
  }

  /**
   * A transfer frame from the machine `hostId`, on its current connection. Passed on unchanged to the other machine
   * of its transfer, or not at all; `frameBytes` is the frame's size on the wire.
   */
  fromHost(hostId: string, ws: WebSocket, type: TransferFrameType, payload: unknown, frameBytes: number): void {
    const transferId = (payload as { transferId?: unknown } | null)?.transferId
    if (!isTransferId(transferId)) return
    const route = this.routes.get(transferId)
    if (!route || (route.from !== hostId && route.to !== hostId)) {
      send(ws, frame('transfer.closed', { transferId, reason: 'not_allowed' }))
      return
    }
    const now = this.now()
    if (now >= route.expiresAt) return void this.close(transferId, 'expired')
    const sender = this.live(hostId)
    const other = this.live(route.from === hostId ? route.to : route.from)
    if (!sender || sender.ws !== ws) return
    if (!other) return route.waits ? undefined : void this.close(transferId, 'peer_left')
    if (frameBytes > HOST_RELAY_MAX_FRAME_BYTES) return void this.close(transferId, 'too_large')

    let pass: unknown = null
    if (type === 'transfer.chunk' && hostId === route.from) {
      const chunk = parseTransferChunk(payload)
      if (chunk) {
        const size = Math.floor((chunk.data.length * 3) / 4)
        route.bytes += size
        if (route.bytes > HOST_TRANSFER_MAX_BYTES) return void this.close(transferId, 'too_large')
        if (!this.take(route, size, now)) return void this.close(transferId, 'too_fast')
        pass = chunk
      }
    } else if (type === 'transfer.ack' && hostId === route.to) {
      const seq = (payload as { seq?: unknown }).seq
      if (typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0) pass = { transferId, seq }
    } else if (type === 'transfer.envelope') {
      const envelope = parseHostEnvelope((payload as { envelope?: unknown }).envelope)
      // Only as itself, only to the other machine: hq computed both fingerprints from their keys.
      if (envelope && envelope.from === sender.fingerprint && envelope.to === other.fingerprint) pass = { transferId, envelope }
    }
    if (pass === null) return
    route.started = true
    route.lastAt = now
    send(other.ws, frame(type, pass))
  }

  isOpen(transferId: string): boolean {
    return this.routes.has(transferId)
  }

  private take(route: Route, size: number, now: number): boolean {
    route.tokens = Math.min(BURST_BYTES, route.tokens + ((now - route.refilledAt) / 1000) * HOST_TRANSFER_MAX_BYTES_PER_SECOND)
    route.refilledAt = now
    if (route.tokens < size) return false
    route.tokens -= size
    return true
  }

  private spend(transferId: string): void {
    this.spent.add(transferId)
    if (this.spent.size > MAX_SPENT) this.spent.delete(this.spent.values().next().value as string)
  }
}
