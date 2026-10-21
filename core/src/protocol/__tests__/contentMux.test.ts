import { describe, it, expect, vi } from 'vitest'
import { StreamMux, type StreamEvents, type MuxOutbound } from '../contentMux.js'
import { MAX_CHUNK_BYTES, encodeControlFrame } from '../content.js'

function pair() {
  let hq!: StreamMux
  let site!: StreamMux
  const toSite: MuxOutbound = {
    sendText: text => site.receiveText(text),
    sendBinary: async bytes => site.receiveBinary(bytes),
  }
  const toHq: MuxOutbound = {
    sendText: text => hq.receiveText(text),
    sendBinary: async bytes => hq.receiveBinary(bytes),
  }
  hq = new StreamMux('opener', toSite)
  site = new StreamMux('server', toHq)
  return { hq, site }
}

function recorder(): StreamEvents & { data: number[]; ended: boolean; accepted: boolean; error: string | null } {
  const r = {
    data: [] as number[], ended: false, accepted: false, error: null as string | null,
    onData: (p: Uint8Array) => { r.data.push(...p) },
    onEnd: () => { r.ended = true },
    onError: (code: string, message: string) => { r.error = `${code}: ${message}` },
    onAccept: () => { r.accepted = true },
  }
  return r
}

describe('StreamMux', () => {
  it('opens a stream, the server accepts it, and the opener hears the accept', () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    site.onOpen = (id, method, params) => {
      expect(method).toBe('files.read')
      expect(params).toEqual({ path: 'a.md' })
      site.accept(id, serverSide)
    }
    const opener = recorder()
    hq.open('files.read', { path: 'a.md' }, opener)
    expect(opener.accepted).toBe(true)
  })

  it('carries bytes both ways on one stream — it is full duplex', async () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    let serverId = -1
    site.onOpen = id => { serverId = id; site.accept(id, serverSide) }
    const opener = recorder()
    const id = hq.open('preview', {}, opener)

    await hq.write(id, new Uint8Array([1, 2, 3]))
    await site.write(serverId, new Uint8Array([9, 8]))

    expect(serverSide.data).toEqual([1, 2, 3])
    expect(opener.data).toEqual([9, 8])
  })

  it('splits a large write into bounded frames and reassembles every byte in order', async () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    site.onOpen = id => site.accept(id, serverSide)
    const sendBinary = vi.spyOn((hq as any).out, 'sendBinary')
    const id = hq.open('files.write', {}, recorder())

    const payload = new Uint8Array(MAX_CHUNK_BYTES * 3 + 17).map((_, i) => i % 251)
    await hq.write(id, payload)

    expect(sendBinary).toHaveBeenCalledTimes(4)
    for (const [frame] of sendBinary.mock.calls) {
      expect((frame as Uint8Array).length).toBeLessThanOrEqual(MAX_CHUNK_BYTES + 4)
    }
    expect(serverSide.data).toEqual(Array.from(payload))
  })

  it('ends each half independently — ending one side leaves the other writable', async () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    let serverId = -1
    site.onOpen = id => { serverId = id; site.accept(id, serverSide) }
    const opener = recorder()
    const id = hq.open('files.write', {}, opener)

    hq.end(id)
    expect(serverSide.ended).toBe(true)
    expect(opener.ended).toBe(false)

    await site.write(serverId, new Uint8Array([4]))
    expect(opener.data).toEqual([4])

    site.end(serverId)
    expect(opener.ended).toBe(true)
    expect(hq.openStreamCount).toBe(0)
    expect(site.openStreamCount).toBe(0)
  })

  it('a server failure reaches the opener as that error and closes the stream both sides', () => {
    const { hq, site } = pair()
    site.onOpen = id => site.fail(id, 'unknown_method', 'Unknown method: nope')
    const opener = recorder()
    hq.open('nope', {}, opener)
    expect(opener.error).toBe('unknown_method: Unknown method: nope')
    expect(opener.accepted).toBe(false)
    expect(hq.openStreamCount).toBe(0)
    expect(site.openStreamCount).toBe(0)
  })

  it('a cancel from the opener reaches the server as cancelled', () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    site.onOpen = id => site.accept(id, serverSide)
    const id = hq.open('files.read', {}, recorder())
    hq.cancel(id)
    expect(serverSide.error).toMatch(/^cancelled/)
    expect(site.openStreamCount).toBe(0)
  })

  it('gives each stream its own id and keeps their bytes apart', async () => {
    const { hq, site } = pair()
    const byMethod = new Map<string, ReturnType<typeof recorder>>()
    site.onOpen = (id, method) => {
      const r = recorder()
      byMethod.set(method, r)
      site.accept(id, r)
    }
    const a = hq.open('a', {}, recorder())
    const b = hq.open('b', {}, recorder())
    expect(a).not.toBe(b)
    await hq.write(b, new Uint8Array([2]))
    await hq.write(a, new Uint8Array([1]))
    expect(byMethod.get('a')!.data).toEqual([1])
    expect(byMethod.get('b')!.data).toEqual([2])
  })

  it('closeAll fails every open stream with the given reason', () => {
    const { hq, site } = pair()
    site.onOpen = id => site.accept(id, recorder())
    const one = recorder()
    const two = recorder()
    hq.open('a', {}, one)
    hq.open('b', {}, two)
    hq.closeAll('disconnected', 'Connection closed')
    expect(one.error).toBe('disconnected: Connection closed')
    expect(two.error).toBe('disconnected: Connection closed')
    expect(hq.openStreamCount).toBe(0)
  })

  it('a server never opens a stream — open() throws in the server role', () => {
    const { site } = pair()
    expect(() => site.open('x', {}, recorder())).toThrow(/opener/)
  })

  it('an opener ignores an inbound open — a site cannot open a stream toward hq', () => {
    const { hq } = pair()
    const sent = vi.spyOn((hq as any).out, 'sendText')
    hq.receiveText(encodeControlFrame({ t: 'open', id: 99, method: 'x', params: {} }))
    expect(hq.openStreamCount).toBe(0)
    // Refused explicitly rather than silently, so the peer does not wait.
    expect(sent).toHaveBeenCalledWith(expect.stringContaining('"protocol"'))
  })

  it('drops data for a stream it does not know rather than throwing', () => {
    const { hq } = pair()
    expect(() => hq.receiveBinary(new Uint8Array([0, 0, 0, 5, 1]))).not.toThrow()
  })

  it('drops a malformed control frame rather than throwing', () => {
    const { hq } = pair()
    expect(() => hq.receiveText('garbage')).not.toThrow()
  })

  it('write() on a stream that has ended its half rejects instead of sending', async () => {
    const { hq, site } = pair()
    site.onOpen = id => site.accept(id, recorder())
    const id = hq.open('a', {}, recorder())
    hq.end(id)
    await expect(hq.write(id, new Uint8Array([1]))).rejects.toThrow(/ended/)
  })

  it('a mux in the opener role cannot accept a stream', () => {
    const { hq } = pair()
    expect(() => hq.accept(1, recorder())).toThrow(/server/)
  })

  it('a server ignores an inbound accept — only the opener waits for one', () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    let serverId = -1
    site.onOpen = id => { serverId = id; site.accept(id, serverSide) }
    hq.open('a', {}, recorder())
    site.receiveText(encodeControlFrame({ t: 'accept', id: serverId }))
    expect(serverSide.accepted).toBe(false)
    expect(site.openStreamCount).toBe(1)
  })

  it('the opener can still fail a stream it opened — hq reports its own buffer overflow this way', () => {
    const { hq, site } = pair()
    const serverSide = recorder()
    site.onOpen = id => site.accept(id, serverSide)
    const id = hq.open('a', {}, recorder())
    hq.fail(id, 'buffer_exceeded', 'too much')
    expect(serverSide.error).toBe('buffer_exceeded: too much')
    expect(hq.openStreamCount).toBe(0)
    expect(site.openStreamCount).toBe(0)
  })
})
