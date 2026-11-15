/**
 * The sealed backup, cut into chunks and passed to the new machine (core's transfer.ts): each signed by this machine
 * for that one, in its place, with the last one marked; no more than `HOST_TRANSFER_WINDOW` ahead of the new
 * machine's acknowledgements; and kept below hq's pace, which drops a transfer that goes faster.
 */
import {
  HOST_TRANSFER_CHUNK_BYTES, HOST_TRANSFER_MAX_BYTES_PER_SECOND, HOST_TRANSFER_WINDOW,
} from '@agenthix/core'
import { signTransferChunk } from '@agenthix/core/host-crypto'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import type { PeerChannel } from './peer'
import type { MoveTimings } from './timings'

/** Three quarters of hq's ceiling, per millisecond. */
const PACE = (HOST_TRANSFER_MAX_BYTES_PER_SECOND * 0.75) / 1000

/** The bytes in pieces of exactly one chunk, the last one shorter; each with whether it is the last. */
async function* pieces(bytes: AsyncIterable<Buffer>): AsyncGenerator<{ piece: Buffer; last: boolean }> {
  let pending: Buffer = Buffer.alloc(0)
  let held: Buffer | null = null
  for await (const b of bytes) {
    pending = pending.length ? Buffer.concat([pending, b]) : b
    while (pending.length >= HOST_TRANSFER_CHUNK_BYTES) {
      if (held) yield { piece: held, last: false }
      held = pending.subarray(0, HOST_TRANSFER_CHUNK_BYTES)
      pending = pending.subarray(HOST_TRANSFER_CHUNK_BYTES)
    }
  }
  if (pending.length) {
    if (held) yield { piece: held, last: false }
    held = pending
  }
  if (held) yield { piece: held, last: true }
}

export async function sendChunks(ctx: Context, channel: PeerChannel, bytes: AsyncIterable<Buffer>, t: MoveTimings): Promise<void> {
  const started = ctx.now().getTime()
  const stalled = () => new Refusal('failed', channel.peerEnded
    ?? (channel.closed ? `HQ stopped passing the backup on (${channel.closed}).` : 'The new machine stopped taking the backup.'))
  let seq = 0
  let sent = 0
  for await (const { piece, last } of pieces(bytes)) {
    if (seq >= HOST_TRANSFER_WINDOW && !(await channel.acknowledged(seq - HOST_TRANSFER_WINDOW, ctx.now().getTime() + t.idleMs))) throw stalled()
    const chunk = await signTransferChunk(channel.keys, { transferId: channel.transferId, from: channel.own, to: channel.peer, seq, last }, piece)
    if (!channel.wire.send('transfer.chunk', chunk)) throw new Refusal('failed', 'The link to HQ dropped while the backup was passed on.')
    seq++
    sent += piece.length
    const ahead = started + sent / PACE - ctx.now().getTime()
    if (ahead > 0) await ctx.sleep(ahead)
  }
  if (seq === 0) throw new Refusal('failed', 'The final backup is empty.')
  if (!(await channel.acknowledged(seq - 1, ctx.now().getTime() + t.idleMs))) throw stalled()
}
