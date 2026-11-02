import { describe, it, expect } from 'vitest'
import { StreamMux, type StreamEvents, type MuxOutbound } from '../contentMux.js'
import { DUPLEX_INITIAL_WINDOW_BYTES, MAX_CHUNK_BYTES, encodeDataFrame, parseControlFrame } from '../content.js'

function pair() {
  let opener!: StreamMux
  let server!: StreamMux
  const toServerText: string[] = []
  const toServer: MuxOutbound = {
    sendText: text => { toServerText.push(text); server.receiveText(text) },
    sendBinary: async bytes => server.receiveBinary(bytes),
  }
  const toOpener: MuxOutbound = {
    sendText: text => opener.receiveText(text),
    sendBinary: async bytes => opener.receiveBinary(bytes),
  }
  opener = new StreamMux('opener', toServer)
  server = new StreamMux('server', toOpener)
  return { opener, server, toServerText }
}

function recorder(): StreamEvents & { bytes: number; ended: boolean; error: string | null; order: string[] } {
  const r = {
    bytes: 0, ended: false, error: null as string | null, order: [] as string[],
    onData: (p: Uint8Array) => { r.bytes += p.length; r.order.push(`data:${p.length}`) },
    onEnd: () => { r.ended = true; r.order.push('end') },
    onError: (code: string, message: string) => { r.error = `${code}: ${message}` },
  }
  return r
}

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

describe('a duplex stream: the opener\'s bytes are flow-controlled too @SC-1464', () => {
  it('says duplex in its open frame, and a stream opened without it does not', () => {
    const p = pair()
    p.opener.open('app.serve', {}, recorder(), { duplex: true })
    p.opener.open('files.serve', {}, recorder())
    expect(parseControlFrame(p.toServerText[0]!)).toMatchObject({ t: 'open', duplex: true })
    expect(parseControlFrame(p.toServerText[1]!)).not.toHaveProperty('duplex')
  })

  it('holds the opener to the initial window until the server grants more', async () => {
    const p = pair()
    let serverId = -1
    const serverSide = recorder()
    p.server.onOpen = id => { serverId = id; p.server.accept(id, serverSide) }
    const id = p.opener.open('app.serve', {}, recorder(), { duplex: true })
    let written = false
    const write = p.opener.write(id, new Uint8Array(DUPLEX_INITIAL_WINDOW_BYTES + 3 * MAX_CHUNK_BYTES)).then(() => { written = true })
    await settle()
    expect(serverSide.bytes).toBe(DUPLEX_INITIAL_WINDOW_BYTES)
    expect(written).toBe(false)
    p.server.credit(serverId, 3 * MAX_CHUNK_BYTES)
    await write
    expect(serverSide.bytes).toBe(DUPLEX_INITIAL_WINDOW_BYTES + 3 * MAX_CHUNK_BYTES)
  })

  it('keeps what the opener sent and its end before the server accepted, and hands them over in order', async () => {
    const p = pair()
    let serverId = -1
    p.server.onOpen = id => { serverId = id }
    const id = p.opener.open('bundle.write', {}, recorder(), { duplex: true })
    await p.opener.write(id, new Uint8Array(100))
    await p.opener.write(id, new Uint8Array(50))
    p.opener.end(id)
    const serverSide = recorder()
    p.server.accept(serverId, serverSide)
    expect(serverSide.order).toEqual(['data:100', 'data:50', 'end'])
  })

  it('fails an opener that sends past its window before the server accepted', () => {
    const p = pair()
    let serverId = -1
    p.server.onOpen = id => { serverId = id }
    const opener = recorder()
    const id = p.opener.open('app.serve', {}, opener, { duplex: true })
    for (let sent = 0; sent <= DUPLEX_INITIAL_WINDOW_BYTES; sent += MAX_CHUNK_BYTES) {
      p.server.receiveBinary(encodeDataFrame(id, new Uint8Array(MAX_CHUNK_BYTES)))
    }
    expect(opener.error).toMatch(/^protocol/)
    expect(p.server.openStreamCount).toBe(0)
    expect(serverId).toBe(id)
  })

  it('still drops bytes sent before the server accepted a stream that is not duplex', () => {
    const p = pair()
    let serverId = -1
    p.server.onOpen = id => { serverId = id }
    const id = p.opener.open('files.serve', {}, recorder())
    p.server.receiveBinary(encodeDataFrame(id, new Uint8Array(10)))
    const serverSide = recorder()
    p.server.accept(serverId, serverSide)
    expect(serverSide.bytes).toBe(0)
  })

  it('lets the server write to the opener without waiting on a duplex stream opened without a window', async () => {
    const p = pair()
    let serverId = -1
    p.server.onOpen = id => { serverId = id; p.server.accept(id, recorder()) }
    const reader = recorder()
    p.opener.open('app.serve', {}, reader, { duplex: true })
    await p.server.write(serverId, new Uint8Array(DUPLEX_INITIAL_WINDOW_BYTES + MAX_CHUNK_BYTES))
    expect(reader.bytes).toBe(DUPLEX_INITIAL_WINDOW_BYTES + MAX_CHUNK_BYTES)
  })

  it('refuses credit from a reader whose bytes are not windowed', () => {
    const p = pair()
    let serverId = -1
    p.server.onOpen = id => { serverId = id; p.server.accept(id, recorder()) }
    p.opener.open('files.serve', {}, recorder())
    const before = p.toServerText.length
    p.server.credit(serverId, 10)
    expect(p.toServerText.length).toBe(before)
  })
})
