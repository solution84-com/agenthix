import { describe, it, expect } from 'vitest'
import { StreamMux, type StreamEvents, type MuxOutbound } from '../contentMux.js'
import { MAX_CHUNK_BYTES, MAX_STREAM_WINDOW_BYTES, encodeControlFrame, encodeDataFrame } from '../content.js'

function pair() {
  let opener!: StreamMux
  let server!: StreamMux
  const toServerText: string[] = []
  const toOpenerText: string[] = []
  const toServer: MuxOutbound = {
    sendText: text => { toServerText.push(text); server.receiveText(text) },
    sendBinary: async bytes => server.receiveBinary(bytes),
  }
  const toOpener: MuxOutbound = {
    sendText: text => { toOpenerText.push(text); opener.receiveText(text) },
    sendBinary: async bytes => opener.receiveBinary(bytes),
  }
  opener = new StreamMux('opener', toServer)
  server = new StreamMux('server', toOpener)
  return { opener, server, toServerText, toOpenerText }
}

function recorder(): StreamEvents & { bytes: number; error: string | null } {
  const r = {
    bytes: 0, error: null as string | null,
    onData: (p: Uint8Array) => { r.bytes += p.length },
    onEnd: () => {},
    onError: (code: string, message: string) => { r.error = `${code}: ${message}` },
  }
  return r
}

/** Lets every pending microtask and timer-free promise run. */
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

function openWindowed(window: number | undefined) {
  const p = pair()
  let serverId = -1
  const serverSide = recorder()
  p.server.onOpen = id => { serverId = id; p.server.accept(id, serverSide) }
  const reader = recorder()
  const id = p.opener.open('files.serve', {}, reader, window === undefined ? undefined : { window })
  return { ...p, id, serverId: () => serverId, serverSide, reader }
}

describe('StreamMux flow control per stream @SC-1464', () => {
  it('holds a fast writer to the window a slow reader opened with', async () => {
    const s = openWindowed(2 * MAX_CHUNK_BYTES)
    let written = false
    const write = s.server.write(s.serverId(), new Uint8Array(10 * MAX_CHUNK_BYTES)).then(() => { written = true })
    await settle()
    expect(s.reader.bytes).toBe(2 * MAX_CHUNK_BYTES)
    expect(written).toBe(false)

    s.opener.credit(s.id, 3 * MAX_CHUNK_BYTES)
    await settle()
    expect(s.reader.bytes).toBe(5 * MAX_CHUNK_BYTES)
    expect(written).toBe(false)

    s.opener.credit(s.id, 5 * MAX_CHUNK_BYTES)
    await write
    expect(s.reader.bytes).toBe(10 * MAX_CHUNK_BYTES)
  })

  it('sends exactly up to a window that is not a whole number of chunks', async () => {
    const s = openWindowed(100)
    void s.server.write(s.serverId(), new Uint8Array(250)).catch(() => {})
    await settle()
    expect(s.reader.bytes).toBe(100)
    s.opener.credit(s.id, 1)
    await settle()
    expect(s.reader.bytes).toBe(101)
  })

  it('waits from the first byte when opened with a window of nothing', async () => {
    const s = openWindowed(0)
    const write = s.server.write(s.serverId(), new Uint8Array(10))
    await settle()
    expect(s.reader.bytes).toBe(0)
    s.opener.credit(s.id, 10)
    await write
    expect(s.reader.bytes).toBe(10)
  })

  it('leaves a stream opened without a window exactly as before: no waiting, no credit', async () => {
    const s = openWindowed(undefined)
    await s.server.write(s.serverId(), new Uint8Array(40 * MAX_CHUNK_BYTES))
    expect(s.reader.bytes).toBe(40 * MAX_CHUNK_BYTES)
    expect(JSON.parse(s.toServerText[0]!)).not.toHaveProperty('window')
  })

  it('ignores credit for a stream opened without a window', async () => {
    const s = openWindowed(undefined)
    s.toOpenerText.length = 0
    s.server.receiveText(encodeControlFrame({ t: 'credit', id: s.serverId(), bytes: 10 }))
    await s.server.write(s.serverId(), new Uint8Array(3 * MAX_CHUNK_BYTES))
    expect(s.reader.bytes).toBe(3 * MAX_CHUNK_BYTES)
    expect(s.toOpenerText).toEqual([])
  })

  it('rejects a waiting write when the opener cancels, and sends nothing more', async () => {
    const s = openWindowed(MAX_CHUNK_BYTES)
    const write = s.server.write(s.serverId(), new Uint8Array(4 * MAX_CHUNK_BYTES))
    await settle()
    s.opener.cancel(s.id)
    await expect(write).rejects.toThrow(/closed during write/)
    expect(s.reader.bytes).toBe(MAX_CHUNK_BYTES)
    expect(s.serverSide.error).toMatch(/^cancelled/)
  })

  it('rejects a waiting write when the server fails the stream or the line closes', async () => {
    const a = openWindowed(0)
    const w1 = a.server.write(a.serverId(), new Uint8Array(5))
    a.server.fail(a.serverId(), 'handler_failed', 'gone')
    await expect(w1).rejects.toThrow(/closed during write/)

    const b = openWindowed(0)
    const w2 = b.server.write(b.serverId(), new Uint8Array(5))
    b.server.closeAll('disconnected', 'line closed')
    await expect(w2).rejects.toThrow(/closed during write/)
  })

  it('fails the stream on a credit that would carry the window past the largest', async () => {
    const s = openWindowed(10)
    s.server.receiveText(encodeControlFrame({ t: 'credit', id: s.serverId(), bytes: MAX_STREAM_WINDOW_BYTES }))
    expect(s.reader.error).toMatch(/^protocol/)
    expect(s.serverSide.error).toMatch(/^protocol/)
    expect(s.server.openStreamCount).toBe(0)
    await expect(s.server.write(s.serverId(), new Uint8Array(1))).rejects.toThrow(/not open/)
  })

  it('ignores a credit for a stream it does not hold, and any credit sent to the opener', () => {
    const s = openWindowed(10)
    s.toOpenerText.length = 0
    s.toServerText.length = 0
    s.server.receiveText(encodeControlFrame({ t: 'credit', id: 999, bytes: 10 }))
    s.opener.receiveText(encodeControlFrame({ t: 'credit', id: s.id, bytes: 10 }))
    expect(s.toOpenerText).toEqual([])
    expect(s.toServerText).toEqual([])
    expect(s.opener.openStreamCount).toBe(1)
  })

  it('fails a stream whose server sends past the window it was given, as a peer ignoring windows would', () => {
    const s = openWindowed(100)
    s.opener.receiveBinary(encodeDataFrame(s.id, new Uint8Array(60)))
    expect(s.reader.error).toBeNull()
    s.opener.receiveBinary(encodeDataFrame(s.id, new Uint8Array(41)))
    expect(s.reader.error).toMatch(/^protocol/)
    expect(s.reader.bytes).toBe(60)
    expect(s.serverSide.error).toMatch(/^protocol/)
    expect(s.opener.openStreamCount).toBe(0)
  })

  it('counts credit the opener granted toward what the server may send', () => {
    const s = openWindowed(100)
    s.opener.receiveBinary(encodeDataFrame(s.id, new Uint8Array(100)))
    s.opener.credit(s.id, 50)
    s.opener.receiveBinary(encodeDataFrame(s.id, new Uint8Array(50)))
    expect(s.reader.error).toBeNull()
    expect(s.reader.bytes).toBe(150)
  })

  it('refuses a credit the opener cannot give, and does nothing for a stream it no longer holds', () => {
    const s = openWindowed(100)
    expect(() => s.opener.credit(s.id, 0)).toThrow()
    expect(() => s.opener.credit(s.id, 1.5)).toThrow()
    expect(() => s.opener.credit(s.id, MAX_STREAM_WINDOW_BYTES)).toThrow()
    expect(() => s.opener.open('m', {}, recorder(), { window: -1 })).toThrow()
    s.opener.cancel(s.id)
    s.toServerText.length = 0
    s.opener.credit(s.id, 10)
    expect(s.toServerText).toEqual([])
  })
})
