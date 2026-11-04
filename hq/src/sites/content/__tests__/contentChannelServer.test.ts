import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import { createHash, randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable, Writable } from 'node:stream'
import {
  SITE_PROTOCOL_VERSION, HQ_SITE_CONTENT_PATH, HQ_SITE_CHANNEL_PATH, HQ_SITE_UNKNOWN_HEADER, StreamMux,
} from '@agenthix/core'
import { attachContentChannel } from '../contentChannelServer'
import { ContentChannelRegistry } from '../contentChannelRegistry'
import { attachSiteChannel } from '../../channel/siteChannelServer'
import { SiteChannelRegistry } from '../../channel/siteChannelRegistry'

// Real sockets on a machine that may be running a whole suite: the logic is quick, the scheduling is not.
beforeAll(() => { vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 }) })
afterAll(() => { vi.resetConfig() })

let server: http.Server
let port: number
let registry: ContentChannelRegistry
let control: SiteChannelRegistry
let sockets: Set<import('node:net').Socket>

const store = {
  markOnline: async () => {}, markOffline: async () => {}, touch: async () => {},
  recordProtocolVersion: async () => {}, markVersionMismatch: async () => {},
}
const exists = async (siteId: string) => siteId !== 'ghost'
const auth = async (siteId: string, credential: string) => (credential === 'good' && siteId !== 'ghost' ? { siteId } : null)

beforeEach(async () => {
  registry = new ContentChannelRegistry()
  control = new SiteChannelRegistry(store)
  server = http.createServer((_q, r) => r.end())
  sockets = new Set()
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  attachContentChannel(server, { registry, authenticate: auth, siteExists: exists, ...store })
  attachSiteChannel(server, { registry: control, authenticate: auth, siteExists: exists, onSiteEvent: async () => {}, ...store })
  await new Promise<void>(r => server.listen(0, r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const s of sockets) s.destroy()
  await new Promise<void>(r => server.close(() => r()))
})

const headers = { Authorization: 'Bearer good', 'X-Site-Id': 's1', 'X-Site-Protocol-Version': SITE_PROTOCOL_VERSION }

/** Dials as a site and serves streams with core's own mux. */
async function dialSite(serve: (mux: StreamMux, id: number, method: string) => void, path = HQ_SITE_CONTENT_PATH) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers })
  const mux = new StreamMux('server', {
    sendText: text => ws.send(text),
    sendBinary: bytes => new Promise((res, rej) => ws.send(bytes, err => (err ? rej(err) : res()))),
  })
  mux.onOpen = (id, method) => serve(mux, id, method)
  ws.on('message', (data, isBinary) => {
    if (isBinary) mux.receiveBinary(new Uint8Array(data as Buffer))
    else mux.receiveText(data.toString())
  })
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject) })
  // Registration happens on the server's side of the upgrade; wait for it.
  await vi.waitFor(() => expect(registry.isConnected('s1')).toBe(true), { timeout: 10_000 })
  return { ws, mux }
}

function sha256(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex')
}

describe('content channel server', () => {
  it('accepts an authenticated site on its own path and registers it', async () => {
    const { ws } = await dialSite(() => {})
    expect(registry.isConnected('s1')).toBe(true)
    ws.close()
  })

  it('refuses a wrong credential with 401', async () => {
    const status = await new Promise<number>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${HQ_SITE_CONTENT_PATH}`, { headers: { ...headers, Authorization: 'Bearer wrong' } })
      ws.once('unexpected-response', (_q, res) => resolve(res.statusCode ?? 0))
      ws.once('error', () => {})
    })
    expect(status).toBe(401)
  })

  it('says a site id hq has no record of is unknown, and a wrong credential for a known one is not', async () => {
    const refusal = (h: Record<string, string>) => new Promise<{ status: number; unknown: string | undefined }>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${HQ_SITE_CONTENT_PATH}`, { headers: h })
      ws.once('unexpected-response', (_q, res) => resolve({ status: res.statusCode ?? 0, unknown: res.headers[HQ_SITE_UNKNOWN_HEADER.toLowerCase()] as string | undefined }))
      ws.once('error', () => {})
    })
    expect(await refusal({ ...headers, 'X-Site-Id': 'ghost' })).toEqual({ status: 401, unknown: '1' })
    expect(await refusal({ ...headers, Authorization: 'Bearer wrong' })).toEqual({ status: 401, unknown: undefined })
  })

  it('leaves the control channel alone: both connections coexist for one site', async () => {
    const content = await dialSite(() => {})
    const controlWs = new WebSocket(`ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, { headers })
    await new Promise<void>((resolve, reject) => { controlWs.once('open', () => resolve()); controlWs.once('error', reject) })
    await vi.waitFor(() => expect(control.isOnline('s1')).toBe(true), { timeout: 10_000 })

    expect(control.isOnline('s1')).toBe(true)
    expect(registry.isConnected('s1')).toBe(true)
    expect(content.ws.readyState).toBe(WebSocket.OPEN)
    content.ws.close()
    controlWs.close()
  })

  it('carries 8 MiB from the site to hq intact, in bounded messages', async () => {
    const payload = randomBytes(8 * 1024 * 1024)
    const { ws } = await dialSite((mux, id) => {
      mux.accept(id, { onData() {}, onEnd() {}, onError() {} })
      void mux.write(id, new Uint8Array(payload)).then(() => mux.end(id))
    })
    const stream = await registry.open('s1', 'files.read', {})
    const parts: Buffer[] = []
    await pipeline(stream, new Writable({ write(c, _e, cb) { parts.push(c); cb() } }))
    expect(sha256(Buffer.concat(parts))).toBe(sha256(payload))
    ws.close()
  })

  it('carries 8 MiB from hq to the site intact', async () => {
    const payload = randomBytes(8 * 1024 * 1024)
    const received: Buffer[] = []
    let done!: () => void
    const finished = new Promise<void>(r => { done = r })
    const { ws } = await dialSite((mux, id) => mux.accept(id, {
      onData: p => received.push(Buffer.from(p)),
      onEnd: () => { mux.end(id); done() },
      onError() {},
    }))
    const stream = await registry.open('s1', 'files.write', {})
    await new Promise<void>((resolve, reject) => stream.end(payload, (err?: Error) => (err ? reject(err) : resolve())))
    await finished
    expect(sha256(Buffer.concat(received))).toBe(sha256(payload))
    ws.close()
  })

  it('never sends a message larger than a chunk plus its id', async () => {
    const sizes: number[] = []
    const { ws } = await dialSite((mux, id) => mux.accept(id, {
      onData() {},
      onEnd: () => mux.end(id),
      onError() {},
    }))
    ws.on('message', (data, isBinary) => { if (isBinary) sizes.push((data as Buffer).length) })
    const stream = await registry.open('s1', 'files.write', {})
    await new Promise<void>((resolve, reject) => stream.end(randomBytes(1024 * 1024), (err?: Error) => (err ? reject(err) : resolve())))
    // Every byte has reached the site: each message is a chunk behind its 4-byte stream id.
    await vi.waitFor(() => expect(sizes.reduce((total, size) => total + size - 4, 0)).toBeGreaterThanOrEqual(1024 * 1024), { timeout: 10_000 })
    expect(Math.max(...sizes)).toBeLessThanOrEqual(64 * 1024 + 4)
    ws.close()
  })

  it('fails every open stream as disconnected when the site drops', async () => {
    const { ws } = await dialSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError() {} }))
    const stream = await registry.open('s1', 'a', {})
    const failed = new Promise<{ code: string }>(resolve => stream.on('error', e => resolve(e as unknown as { code: string })))
    ws.terminate()
    expect((await failed).code).toBe('disconnected')
    await vi.waitFor(() => expect(registry.isConnected('s1')).toBe(false), { timeout: 10_000 })
    expect(registry.isConnected('s1')).toBe(false)
  })

  it('a stream with no error listener does not crash hq when the site drops', async () => {
    const { ws } = await dialSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError() {} }))
    const stream = await registry.open('s1', 'a', {})

    // An EventEmitter emitting 'error' with no listener throws. If the stream
    // did that here, it would throw out of the socket's close handler.
    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.on('uncaughtException', onUncaught)
    try {
      ws.terminate()
      await vi.waitFor(() => expect(registry.isConnected('s1')).toBe(false), { timeout: 10_000 })
      await new Promise(r => setTimeout(r, 20))
      expect(registry.isConnected('s1')).toBe(false)
      expect(stream.destroyed).toBe(true)
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })

  it('a stream written through .pipe() does not crash hq when the site drops mid-transfer', async () => {
    const { ws } = await dialSite((mux, id) => mux.accept(id, { onData() {}, onEnd() {}, onError() {} }))
    const stream = await registry.open('s1', 'files.write', {})
    const source = new Readable({ read() { this.push(Buffer.alloc(64 * 1024)) } })

    // pipe() attaches its own 'error' listener, then removes it and re-throws
    // when it finds nobody else listening — so a listener count is no guard.
    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.on('uncaughtException', onUncaught)
    try {
      source.pipe(stream)
      await new Promise(r => setTimeout(r, 20))
      ws.terminate()
      await vi.waitFor(() => expect(registry.isConnected('s1')).toBe(false), { timeout: 10_000 })
      await new Promise(r => setTimeout(r, 50))
      expect(stream.destroyed).toBe(true)
      expect(uncaught).toEqual([])
    } finally {
      source.destroy()
      process.off('uncaughtException', onUncaught)
    }
  })
})
