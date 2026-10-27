/**
 * A `ContentStream` on a stream opened with a window: the multiplexer's wait for credit is the Duplex's write
 * backpressure, so a source piped into it is read only as fast as the opener grants credit.
 */
import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { MAX_CHUNK_BYTES, StreamMux } from '@agenthix/core'
import { ContentStream } from '../contentStream'

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

function windowedPair(window: number | undefined) {
  let server!: StreamMux
  const opener = new StreamMux('opener', { sendText: t => server.receiveText(t), sendBinary: async b => server.receiveBinary(b) })
  server = new StreamMux('server', { sendText: t => opener.receiveText(t), sendBinary: async b => opener.receiveBinary(b) })
  let stream!: ContentStream
  server.onOpen = id => {
    const attached = ContentStream.attach(server, id)
    server.accept(id, attached.events)
    stream = attached.stream
  }
  const got = { bytes: 0, ended: false, error: null as string | null }
  const id = opener.open('files.serve', {}, {
    onData: p => { got.bytes += p.length },
    onEnd: () => { got.ended = true },
    onError: code => { got.error = code },
  }, window === undefined ? undefined : { window })
  return { opener, id, stream, got }
}

/** A source that counts what was pulled from it, as a file read would be. */
function countingSource(total: number) {
  const pulled = { bytes: 0 }
  const source = new Readable({
    highWaterMark: MAX_CHUNK_BYTES,
    read() {
      if (pulled.bytes >= total) return void this.push(null)
      const size = Math.min(MAX_CHUNK_BYTES, total - pulled.bytes)
      pulled.bytes += size
      this.push(Buffer.alloc(size))
    },
  })
  return { source, pulled }
}

describe('ContentStream on a windowed stream @SC-1499', () => {
  it('reads its source only as far as the window and the buffers between allow, until credit comes', async () => {
    const window = 4 * MAX_CHUNK_BYTES
    const total = 64 * MAX_CHUNK_BYTES
    const p = windowedPair(window)
    const { source, pulled } = countingSource(total)
    source.pipe(p.stream)
    await settle()

    expect(p.got.bytes).toBe(window)
    // The window, plus what the source and the Duplex each buffer before they push back.
    expect(pulled.bytes).toBeLessThanOrEqual(window + 4 * MAX_CHUNK_BYTES)
    expect(pulled.bytes).toBeLessThan(total)

    for (let i = 0; i < 200 && !p.got.ended; i++) {
      p.opener.credit(p.id, window)
      await settle()
    }
    expect(p.got.bytes).toBe(total)
    expect(p.got.ended).toBe(true)
    expect(p.got.error).toBeNull()
  })

  it('streams without waiting when the stream was opened without a window', async () => {
    const total = 64 * MAX_CHUNK_BYTES
    const p = windowedPair(undefined)
    const { source } = countingSource(total)
    source.pipe(p.stream)
    for (let i = 0; i < 100 && !p.got.ended; i++) await settle()
    expect(p.got.bytes).toBe(total)
    expect(p.got.ended).toBe(true)
  })

  it('lets a write waiting for credit fail when the opener cancels, and closes the stream', async () => {
    const p = windowedPair(MAX_CHUNK_BYTES)
    const { source } = countingSource(16 * MAX_CHUNK_BYTES)
    source.pipe(p.stream)
    await settle()
    const closed = new Promise(resolve => p.stream.once('close', resolve))
    p.opener.cancel(p.id)
    await closed
    expect(p.stream.destroyed).toBe(true)
    expect(p.got.bytes).toBe(MAX_CHUNK_BYTES)
  })
})
