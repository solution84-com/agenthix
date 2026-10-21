import { describe, it, expect, vi } from 'vitest'
import { StreamMux, MAX_STREAM_BUFFER_BYTES, type StreamEvents } from '@agenthix/core'
import { ContentChannelRegistry, type ContentSocket } from '../contentChannelRegistry'
import { ContentStreamFailed } from '../contentStream'

/** A socket whose far end is a site-side mux in the server role. */
function fakeSite(serve: (site: StreamMux, id: number, method: string) => void) {
  let site!: StreamMux
  const socket: ContentSocket & { closed: [number?, string?] | null } = {
    OPEN: 1,
    readyState: 1,
    closed: null,
    send(data, cb) {
      if (typeof data === 'string') site.receiveText(data)
      else site.receiveBinary(data)
      cb?.()
    },
    close(code, reason) { this.closed = [code, reason] },
  }
  return {
    socket,
    connect(hqMux: StreamMux) {
      site = new StreamMux('server', {
        sendText: text => hqMux.receiveText(text),
        sendBinary: async bytes => hqMux.receiveBinary(bytes),
      })
      site.onOpen = (id, method) => serve(site, id, method)
    },
  }
}

function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []
    stream.on('data', (c: Buffer) => parts.push(c))
    stream.on('end', () => resolve(Buffer.concat(parts)))
    stream.on('error', reject)
  })
}

describe('ContentChannelRegistry', () => {
  it('refuses to open a stream to a site with no content connection, as offline', async () => {
    const registry = new ContentChannelRegistry()
    await expect(registry.open('s1', 'files.read', {})).rejects.toMatchObject({ code: 'offline' })
  })

  it('opens a stream, reads what the site sends, and sees the end', async () => {
    const registry = new ContentChannelRegistry()
    const site = fakeSite((mux, id) => {
      mux.accept(id, { onData() {}, onEnd() {}, onError() {} })
      void mux.write(id, new Uint8Array(Buffer.from('hello'))).then(() => mux.end(id))
    })
    site.connect(registry.add('s1', site.socket))

    const stream = await registry.open('s1', 'files.read', { path: 'a.md' })
    expect((await collect(stream)).toString()).toBe('hello')
  })

  it('writes to the site through the stream, with the site seeing every byte and the end', async () => {
    const registry = new ContentChannelRegistry()
    const received: number[] = []
    let ended = false
    const site = fakeSite((mux, id) => mux.accept(id, {
      onData: p => received.push(...p),
      onEnd: () => { ended = true },
      onError() {},
    }))
    site.connect(registry.add('s1', site.socket))

    const stream = await registry.open('s1', 'files.write', {})
    await new Promise<void>((resolve, reject) => stream.end(Buffer.from([1, 2, 3]), (err?: Error) => err ? reject(err) : resolve()))
    expect(received).toEqual([1, 2, 3])
    expect(ended).toBe(true)
  })

  it('rejects the open with the site\'s own error when it refuses the method', async () => {
    const registry = new ContentChannelRegistry()
    const site = fakeSite((mux, id, method) => mux.fail(id, 'unknown_method', `Unknown method: ${method}`))
    site.connect(registry.add('s1', site.socket))
    await expect(registry.open('s1', 'nope', {})).rejects.toMatchObject({ code: 'unknown_method' })
  })

  it('rejects the open as timeout when the site never accepts, and cancels it', async () => {
    const registry = new ContentChannelRegistry()
    const site = fakeSite(() => {})
    const hqMux = registry.add('s1', site.socket)
    site.connect(hqMux)
    await expect(registry.open('s1', 'slow', {}, 20)).rejects.toMatchObject({ code: 'timeout' })
    expect(hqMux.openStreamCount).toBe(0)
  })

  it('a stream that buffers past the limit fails as buffer_exceeded rather than growing', async () => {
    const registry = new ContentChannelRegistry()
    let serverWrite!: (p: Uint8Array) => Promise<void>
    const site = fakeSite((mux, id) => {
      mux.accept(id, { onData() {}, onEnd() {}, onError() {} })
      serverWrite = p => mux.write(id, p)
    })
    site.connect(registry.add('s1', site.socket))
    const stream = await registry.open('s1', 'flood', {})
    const failed = new Promise<ContentStreamFailed>(resolve => stream.on('error', e => resolve(e as ContentStreamFailed)))

    // Nobody reads the stream, so everything the site sends stays buffered.
    const piece = new Uint8Array(1024 * 1024)
    for (let i = 0; i <= MAX_STREAM_BUFFER_BYTES / piece.length; i++) {
      await serverWrite(piece).catch(() => {})
    }
    expect((await failed).code).toBe('buffer_exceeded')
  })

  it('a newer connection from the same site replaces the older one, failing its streams', async () => {
    const registry = new ContentChannelRegistry()
    const first = fakeSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError() {} }))
    first.connect(registry.add('s1', first.socket))
    const stream = await registry.open('s1', 'a', {})
    const failed = new Promise<ContentStreamFailed>(resolve => stream.on('error', e => resolve(e as ContentStreamFailed)))

    const second = fakeSite(() => {})
    second.connect(registry.add('s1', second.socket))

    expect((await failed).code).toBe('disconnected')
    expect(first.socket.closed?.[0]).toBe(4000)
  })

  it('removing a displaced socket does not clear the connection that replaced it', () => {
    const registry = new ContentChannelRegistry()
    const first = fakeSite(() => {})
    const second = fakeSite(() => {})
    first.connect(registry.add('s1', first.socket))
    second.connect(registry.add('s1', second.socket))
    registry.remove('s1', first.socket)
    expect(registry.isConnected('s1')).toBe(true)
  })

  it('revoke closes the connection with 4001 and fails its streams', async () => {
    const registry = new ContentChannelRegistry()
    const site = fakeSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError() {} }))
    site.connect(registry.add('s1', site.socket))
    const stream = await registry.open('s1', 'a', {})
    const failed = new Promise<ContentStreamFailed>(resolve => stream.on('error', e => resolve(e as ContentStreamFailed)))

    registry.revoke('s1')

    expect(site.socket.closed?.[0]).toBe(4001)
    expect((await failed).code).toBe('disconnected')
    expect(registry.isConnected('s1')).toBe(false)
  })

  it('destroying a stream from hq cancels it on the site', async () => {
    const registry = new ContentChannelRegistry()
    const onError = vi.fn()
    const site = fakeSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError }))
    site.connect(registry.add('s1', site.socket))
    const stream = await registry.open('s1', 'a', {})
    stream.destroy()
    expect(onError).toHaveBeenCalledWith('cancelled', expect.any(String))
  })
})

describe('ContentChannelRegistry.closeForRotation — R-132', () => {
  function socket(): ContentSocket & { closed: number | null } {
    return { OPEN: 1, readyState: 1, closed: null, send() {}, close(code) { this.closed = code ?? null } }
  }

  it('closes the content socket so it reconnects with the new credential', () => {
    const registry = new ContentChannelRegistry()
    const s = socket()
    registry.add('s1', s)
    registry.closeForRotation('s1')
    expect(s.closed).toBe(4002)
  })

  it('leaves a connection that replaced the one it was told about', () => {
    const registry = new ContentChannelRegistry()
    registry.add('s1', socket())
    const told = registry.current('s1')!
    const replacement = socket()
    registry.add('s1', replacement)
    registry.closeForRotation('s1', told)
    expect(replacement.closed).toBeNull()
  })

  it('does nothing for a site with no content connection', () => {
    expect(() => new ContentChannelRegistry().closeForRotation('nobody')).not.toThrow()
  })
})
