import { Duplex } from 'node:stream'
import { MAX_STREAM_BUFFER_BYTES, type ContentErrorCode, type StreamMux, type StreamEvents } from '@agenthix/core'

export class ContentStreamFailed extends Error {
  constructor(message: string, readonly code: ContentErrorCode) {
    super(message)
    this.name = 'ContentStreamFailed'
  }
}

/**
 * One content stream as a Node Duplex, so callers use `pipeline()` against a
 * file or an HTTP response and get backpressure on writes for free.
 *
 * The site serves streams rather than opening them: a handler reads hq's
 * request to its end and then writes its response, so both halves stay open
 * independently until each is explicitly ended.
 *
 * Reads cannot push back across a multiplexed socket without stalling every
 * other stream on it, so a stream instead fails once its unread buffer passes
 * MAX_STREAM_BUFFER_BYTES — a stated limit rather than unbounded memory.
 */
export class ContentStream extends Duplex {
  private failed = false

  private constructor(private readonly mux: StreamMux, readonly id: number) {
    super({ allowHalfOpen: true })
    // A failure is always delivered to anyone listening — pipeline(),
    // finished(), an explicit on('error'). This listener exists only so that
    // nobody listening can never mean an unlistened 'error' thrown out of a
    // socket's close handler, which would crash the process.
    this.on('error', () => {})
  }

  static attach(mux: StreamMux, id: number): { stream: ContentStream; events: StreamEvents } {
    const stream = new ContentStream(mux, id)
    const events: StreamEvents = {
      onData: payload => {
        if (stream.failed) return
        stream.push(Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength))
        if (stream.readableLength > MAX_STREAM_BUFFER_BYTES) {
          stream.failWith('buffer_exceeded', `Stream ${id} buffered more than ${MAX_STREAM_BUFFER_BYTES} unread bytes`)
        }
      },
      onEnd: () => {
        if (!stream.failed) stream.push(null)
      },
      onError: (code, message) => {
        if (stream.failed) return
        stream.failed = true
        stream.destroy(new ContentStreamFailed(message, code))
      },
    }
    return { stream, events }
  }

  private failWith(code: ContentErrorCode, message: string): void {
    this.failed = true
    this.mux.fail(this.id, code, message)
    this.destroy(new ContentStreamFailed(message, code))
  }

  override _read(): void {
    // Data is pushed as frames arrive; there is nothing to pull.
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.mux.write(this.id, chunk).then(() => callback(), callback)
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.mux.end(this.id)
    callback()
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.failed) {
      this.failed = true
      this.mux.fail(this.id, 'cancelled', 'Stream closed by the site')
    }
    callback(error)
  }
}
