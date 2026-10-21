import {
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
 * them. Site-to-hq calls stay on ordinary HTTPS.
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
}

export class StreamMux {
  private readonly streams = new Map<number, StreamState>()
  private nextId = 1

  onOpen: ((id: number, method: string, params: unknown) => void) | null = null

  constructor(private readonly role: MuxRole, private readonly out: MuxOutbound) {}

  get openStreamCount(): number {
    return this.streams.size
  }

  open(method: string, params: unknown, events: StreamEvents): number {
    if (this.role !== 'opener') throw new Error('Only the opener opens streams; a site answers them')
    const id = this.nextId++
    this.streams.set(id, { events, localEnded: false, remoteEnded: false })
    this.out.sendText(encodeControlFrame({ t: 'open', id, method, params }))
    return id
  }

  accept(id: number, events: StreamEvents): void {
    if (this.role !== 'server') throw new Error('Only the server accepts streams; hq opens them')
    const stream = this.streams.get(id)
    if (!stream) return
    stream.events = events
    this.out.sendText(encodeControlFrame({ t: 'accept', id }))
  }

  async write(id: number, payload: Uint8Array): Promise<void> {
    const stream = this.streams.get(id)
    if (!stream) throw new Error(`Stream ${id} is not open`)
    if (stream.localEnded) throw new Error(`Stream ${id} has ended its half`)
    for (const piece of chunkPayload(payload)) {
      // Re-checked per chunk: the stream can fail while an earlier chunk flushes.
      if (!this.streams.has(id)) throw new Error(`Stream ${id} closed during write`)
      await this.out.sendBinary(encodeDataFrame(id, piece))
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
    if (!this.streams.has(id)) return
    this.streams.delete(id)
    this.out.sendText(encodeControlFrame({ t: 'error', id, code, message }))
  }

  cancel(id: number): void {
    if (this.role !== 'opener' || !this.streams.has(id)) return
    this.streams.delete(id)
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
    if (!stream?.events || stream.remoteEnded) return
    stream.events.onData(frame.payload)
  }

  closeAll(code: ContentErrorCode, message: string): void {
    const streams = [...this.streams.values()]
    this.streams.clear()
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
        this.streams.set(frame.id, { events: null, localEnded: false, remoteEnded: false })
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
        this.streams.delete(frame.id)
        stream.events?.onError(frame.code, frame.message)
        return
      }
      case 'cancel': {
        const stream = this.streams.get(frame.id)
        if (!stream || this.role !== 'server') return
        this.streams.delete(frame.id)
        stream.events?.onError('cancelled', 'Cancelled by hq')
        return
      }
    }
  }

  private forgetIfDone(id: number, stream: StreamState): void {
    if (stream.localEnded && stream.remoteEnded) this.streams.delete(id)
  }
}
