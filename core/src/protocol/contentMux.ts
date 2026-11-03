import {
  DUPLEX_INITIAL_WINDOW_BYTES,
  MAX_STREAM_WINDOW_BYTES,
  type ContentErrorCode,
  encodeControlFrame,
  parseControlFrame,
  encodeDataFrame,
  decodeDataFrame,
  chunkPayload,
} from './content.js'

/**
 * The content transport's stream state machine, with no I/O of its own. Each
 * app hands it a way to send frames and feeds it the frames it receives; it
 * keeps stream ids, halves and failures straight. It lives here, once, so hq
 * and a site cannot drift on the protocol — only a thin adapter each side.
 *
 * hq is the opener and a site the server: a site answers streams, never opens
 * them. Site-to-hq calls stay on ordinary HTTPS. On a site's relay line the
 * relay is the opener.
 */
export type MuxRole = 'opener' | 'server'

export interface MuxOutbound {
  sendText(text: string): void
  sendBinary(bytes: Uint8Array): Promise<void>
}

export interface StreamEvents {
  onData(payload: Uint8Array): void
  onEnd(): void
  onError(code: ContentErrorCode, message: string): void
  onAccept?(): void
}

type StreamState = {
  events: StreamEvents | null
  /** We have ended our half. */
  localEnded: boolean
  /** The peer has ended its half. */
  remoteEnded: boolean
  /**
   * Bytes this side may still send, when the stream was opened with a window (the server's view); null is unlimited.
   */
  sendWindow: number | null
  /** Bytes the peer may still send, when we opened the stream with a window (the opener's view); null is unlimited. */
  receiveWindow: number | null
  /** Writes waiting for credit; woken by credit or by the stream going away. */
  waiting: Array<() => void>
  /** A duplex stream's bytes that arrived before the server accepted it (the server's view); the window bounds them. */
  early: Uint8Array[] | null
}

export interface OpenOptions {
  /** Bytes the server may send before it waits for `credit`; omitted, the stream is unlimited. */
  window?: number
  /**
   * The opener's own bytes are flow-controlled too (content.ts, `DUPLEX_INITIAL_WINDOW_BYTES`): it may send that many
   * before the server grants more, and may send before the server accepts.
   */
  duplex?: boolean
}

function isWindow(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min && value <= MAX_STREAM_WINDOW_BYTES
}

function newStream(
  events: StreamEvents | null, sendWindow: number | null, receiveWindow: number | null, early: Uint8Array[] | null = null,
): StreamState {
  return { events, localEnded: false, remoteEnded: false, sendWindow, receiveWindow, waiting: [], early }
}

export class StreamMux {
  private readonly streams = new Map<number, StreamState>()
  private nextId = 1

  onOpen: ((id: number, method: string, params: unknown) => void) | null = null

  constructor(private readonly role: MuxRole, private readonly out: MuxOutbound) {}

  get openStreamCount(): number {
    return this.streams.size
  }

  open(method: string, params: unknown, events: StreamEvents, options: OpenOptions = {}): number {
    if (this.role !== 'opener') throw new Error('Only the opener opens streams; a site answers them')
    const { window, duplex } = options
    if (window !== undefined && !isWindow(window, 0)) throw new Error(`A stream window is 0 to ${MAX_STREAM_WINDOW_BYTES} bytes`)
    const id = this.nextId++
    this.streams.set(id, newStream(events, duplex ? DUPLEX_INITIAL_WINDOW_BYTES : null, window ?? null))
    this.out.sendText(encodeControlFrame({
      t: 'open', id, method, params, ...(window === undefined ? {} : { window }), ...(duplex ? { duplex: true as const } : {}),
    }))
    return id
  }

  /**
   * Lets the other end send `bytes` more on a stream whose bytes toward this end are windowed: the server's on a stream
   * opened with a window, the opener's on a duplex stream. Call it as the reader takes what arrived.
   */
  credit(id: number, bytes: number): void {
    const stream = this.streams.get(id)
    if (!stream || stream.receiveWindow === null || stream.remoteEnded) return
    if (!isWindow(bytes, 1) || !isWindow(stream.receiveWindow + bytes, 0)) {
      throw new Error(`Credit of ${bytes} bytes would take stream ${id}'s window past ${MAX_STREAM_WINDOW_BYTES}`)
    }
    stream.receiveWindow += bytes
    this.out.sendText(encodeControlFrame({ t: 'credit', id, bytes }))
  }

  accept(id: number, events: StreamEvents): void {
    if (this.role !== 'server') throw new Error('Only the server accepts streams; hq opens them')
    const stream = this.streams.get(id)
    if (!stream) return
    stream.events = events
    this.out.sendText(encodeControlFrame({ t: 'accept', id }))
    // A duplex stream's opener may have sent, and even ended its half, before this.
    const early = stream.early
    if (early === null) return
    stream.early = null
    for (const chunk of early) if (this.streams.get(id) === stream) events.onData(chunk)
    if (stream.remoteEnded && this.streams.get(id) === stream) {
      events.onEnd()
      this.forgetIfDone(id, stream)
    }
  }

  async write(id: number, payload: Uint8Array): Promise<void> {
    const stream = this.streams.get(id)
    if (!stream) throw new Error(`Stream ${id} is not open`)
    if (stream.localEnded) throw new Error(`Stream ${id} has ended its half`)
    for (let piece of chunkPayload(payload)) {
      while (piece.length > 0) {
        // Re-checked per frame: the stream can fail while an earlier frame flushes or while it waits for credit.
        if (this.streams.get(id) !== stream) throw new Error(`Stream ${id} closed during write`)
        if (stream.sendWindow === 0) {
          await new Promise<void>(resolve => { stream.waiting.push(resolve) })
          continue
        }
        const size = stream.sendWindow === null ? piece.length : Math.min(piece.length, stream.sendWindow)
        if (stream.sendWindow !== null) stream.sendWindow -= size
        await this.out.sendBinary(encodeDataFrame(id, piece.subarray(0, size)))
        piece = piece.subarray(size)
      }
    }
  }

  end(id: number): void {
    const stream = this.streams.get(id)
    if (!stream || stream.localEnded) return
    stream.localEnded = true
    this.out.sendText(encodeControlFrame({ t: 'end', id }))
    this.forgetIfDone(id, stream)
  }

  fail(id: number, code: ContentErrorCode, message: string): void {
    if (!this.drop(id)) return
    this.out.sendText(encodeControlFrame({ t: 'error', id, code, message }))
  }

  cancel(id: number): void {
    if (this.role !== 'opener' || !this.drop(id)) return
    this.out.sendText(encodeControlFrame({ t: 'cancel', id }))
  }

  receiveText(text: string): void {
    const frame = parseControlFrame(text)
    if (!frame) return
    this.onControl(frame)
  }

  receiveBinary(bytes: Uint8Array): void {
    const frame = decodeDataFrame(bytes)
    if (!frame) return
    const stream = this.streams.get(frame.id)
    // Data for a stream that has failed, been cancelled, or never existed is
    // dropped: it is either late or wrong, and neither is worth closing over.
    // So is data before a stream is accepted, unless it is duplex.
    if (!stream || (!stream.events && !stream.early) || stream.remoteEnded) return
    if (stream.receiveWindow !== null) {
      if (frame.payload.length > stream.receiveWindow) {
        // A peer that ignores the window: its bytes would otherwise be held without bound.
        const message = `Stream ${frame.id} sent past the window it was given`
        this.fail(frame.id, 'protocol', message)
        stream.events?.onError('protocol', message)
        return
      }
      stream.receiveWindow -= frame.payload.length
    }
    if (stream.events) stream.events.onData(frame.payload)
    else stream.early?.push(frame.payload.slice())
  }

  closeAll(code: ContentErrorCode, message: string): void {
    const streams = [...this.streams.values()]
    this.streams.clear()
    for (const s of streams) this.wakeWriters(s)
    for (const s of streams) s.events?.onError(code, message)
  }

  private onControl(frame: NonNullable<ReturnType<typeof parseControlFrame>>): void {
    switch (frame.t) {
      case 'open': {
        if (this.role !== 'server') {
          // A site never opens a stream toward hq. Refuse it explicitly so the
          // peer is not left waiting on an open nobody will accept.
          this.out.sendText(encodeControlFrame({
            t: 'error', id: frame.id, code: 'protocol', message: 'hq does not serve streams',
          }))
          return
        }
        if (this.streams.has(frame.id)) return
        this.streams.set(frame.id, frame.duplex
          ? newStream(null, frame.window ?? null, DUPLEX_INITIAL_WINDOW_BYTES, [])
          : newStream(null, frame.window ?? null, null))
        if (this.onOpen) this.onOpen(frame.id, frame.method, frame.params)
        else this.fail(frame.id, 'unknown_method', `Unknown method: ${frame.method}`)
        return
      }
      case 'accept': {
        if (this.role !== 'opener') return
        this.streams.get(frame.id)?.events?.onAccept?.()
        return
      }
      case 'end': {
        const stream = this.streams.get(frame.id)
        if (!stream || stream.remoteEnded) return
        stream.remoteEnded = true
        stream.events?.onEnd()
        this.forgetIfDone(frame.id, stream)
        return
      }
      case 'error': {
        const stream = this.streams.get(frame.id)
        if (!stream) return
        this.drop(frame.id)
        stream.events?.onError(frame.code, frame.message)
        return
      }
      case 'cancel': {
        const stream = this.streams.get(frame.id)
        if (!stream || this.role !== 'server') return
        this.drop(frame.id)
        stream.events?.onError('cancelled', 'Cancelled by hq')
        return
      }
      case 'credit': {
        // Late credit for a stream already over is normal, and credit for a stream without a window means nothing.
        // An opener's sends are windowed only on a duplex stream, so credit to an opener counts only there.
        const stream = this.streams.get(frame.id)
        if (!stream || stream.sendWindow === null) return
        if (stream.sendWindow + frame.bytes > MAX_STREAM_WINDOW_BYTES) {
          const message = `Credit took stream ${frame.id}'s window past ${MAX_STREAM_WINDOW_BYTES} bytes`
          this.fail(frame.id, 'protocol', message)
          stream.events?.onError('protocol', message)
          return
        }
        stream.sendWindow += frame.bytes
        this.wakeWriters(stream)
        return
      }
    }
  }

  private forgetIfDone(id: number, stream: StreamState): void {
    if (stream.localEnded && stream.remoteEnded) this.drop(id)
  }

  /** Forgets a stream, waking any write waiting on it so it sees the stream is gone. False if it was not held. */
  private drop(id: number): boolean {
    const stream = this.streams.get(id)
    if (!stream) return false
    this.streams.delete(id)
    this.wakeWriters(stream)
    return true
  }

  private wakeWriters(stream: StreamState): void {
    const waiting = stream.waiting
    stream.waiting = []
    for (const wake of waiting) wake()
  }
}
