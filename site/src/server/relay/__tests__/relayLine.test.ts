import { describe, it, expect, afterEach, vi } from 'vitest'
import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  CONTENT_LINK_MAX_MESSAGE_BYTES, LOCATION_FILE_METHODS, RELAY_PROTOCOL_VERSION, SITE_PROTOCOL_VERSION, StreamMux, type StreamEvents,
} from '@agenthix/core'
import { RelayLine } from '../relayLine'
import type { ContentHandler } from '../../hq/content/contentMethods'

let server: http.Server | null = null
let line: RelayLine | null = null

afterEach(async () => {
  line?.stop()
  line = null
  if (server) {
    server.closeAllConnections()
    await new Promise<void>(r => server!.close(() => r()))
  }
  server = null
})

type Dial = { mux: StreamMux; ws: WebSocket; headers: http.IncomingHttpHeaders }

/** A fake relay: takes lines (or refuses the first `refuse` dials, or those `accepts` turns down) and hands each back as an opener mux. */
async function fakeRelay(opts: { refuse?: number; accepts?: (h: http.IncomingHttpHeaders) => boolean } = {}) {
  const dials: Dial[] = []
  const refusedHeaders: http.IncomingHttpHeaders[] = []
  let refuse = opts.refuse ?? 0
  const wss = new WebSocketServer({ noServer: true })
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket, head) => {
    if (refuse > 0 || (opts.accepts && !opts.accepts(req.headers))) {
      refuse--
      refusedHeaders.push(req.headers)
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const mux = new StreamMux('opener', {
        sendText: t => ws.send(t),
        sendBinary: b => new Promise((res, rej) => ws.send(b, e => (e ? rej(e) : res()))),
      })
      ws.on('message', (data, isBinary) => {
        if (isBinary) mux.receiveBinary(new Uint8Array(data as Buffer))
        else mux.receiveText(data.toString())
      })
      dials.push({ mux, ws, headers: req.headers })
    })
  })
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r))
  const port = (server!.address() as { port: number }).port
  return { url: `ws://127.0.0.1:${port}/relay-line`, dials, refusedHeaders }
}

function open(mux: StreamMux, method: string) {
  const data: Buffer[] = []
  return new Promise<{ ok: true; body: string } | { ok: false; error: string }>(resolve => {
    const events: StreamEvents = {
      onAccept: () => {},
      onData: p => data.push(Buffer.from(p)),
      onEnd: () => resolve({ ok: true, body: Buffer.concat(data).toString() }),
      onError: (code, message) => resolve({ ok: false, error: `${code}: ${message}` }),
    }
    mux.open(method, { ticket: 't' }, events)
  })
}

const hello: ContentHandler = async stream => {
  await new Promise<void>(r => stream.end(Buffer.from('hello'), () => r()))
}

function startLine(url: string, onUp = () => {}) {
  line = new RelayLine({
    url, relayId: 'relay-1', siteId: 'site-1', pass: 'pass-1',
    methods: { 'files.serve': hello }, onUp, reconnectDelayMs: 20,
  })
  line.start()
  return line
}

describe('RelayLine @SC-1501 @SC-1566', () => {
  it('dials with the pass, the site id and both protocol versions, and says when it is up', async () => {
    const relay = await fakeRelay()
    const onUp = vi.fn()
    startLine(relay.url, onUp)
    await vi.waitFor(() => expect(onUp).toHaveBeenCalledTimes(1))
    const { headers } = relay.dials[0]
    expect(headers.authorization).toBe('Bearer pass-1')
    expect(headers['x-site-id']).toBe('site-1')
    expect(headers['x-site-protocol-version']).toBe(SITE_PROTOCOL_VERSION)
    expect(headers['x-relay-protocol-version']).toBe(RELAY_PROTOCOL_VERSION)
  })

  it('closes the line on a message past the line\'s limit, rather than holding it whole', async () => {
    const relay = await fakeRelay()
    startLine(relay.url)
    await vi.waitFor(() => expect(relay.dials).toHaveLength(1))
    const { ws } = relay.dials[0]
    const closed = new Promise<number>(r => ws.on('close', code => r(code)))
    ws.send(Buffer.alloc(CONTENT_LINK_MAX_MESSAGE_BYTES + 1), { binary: true })
    expect(await closed).toBe(1009)
  })

  it('serves its methods to the relay, as the multiplexer\'s server', async () => {
    const relay = await fakeRelay()
    startLine(relay.url)
    await vi.waitFor(() => expect(relay.dials).toHaveLength(1))
    expect(await open(relay.dials[0].mux, 'files.serve')).toEqual({ ok: true, body: 'hello' })
  })

  it('refuses every method hq\'s channel serves: a relay reaches files only on a ticket', async () => {
    const relay = await fakeRelay()
    startLine(relay.url)
    await vi.waitFor(() => expect(relay.dials).toHaveLength(1))
    const answer = await open(relay.dials[0].mux, LOCATION_FILE_METHODS.readFile)
    expect(answer.ok).toBe(false)
    expect(answer.ok === false && answer.error).toMatch(/^unknown_method/)
  })

  it('dials again after a refused pass, presenting the pass hq renewed', async () => {
    const relay = await fakeRelay({ accepts: h => h.authorization === 'Bearer pass-2' })
    const l = startLine(relay.url)
    await vi.waitFor(() => expect(relay.refusedHeaders.length).toBeGreaterThanOrEqual(1))
    l.setPass('pass-2')
    await vi.waitFor(() => expect(relay.dials).toHaveLength(1))
    expect(relay.refusedHeaders[0].authorization).toBe('Bearer pass-1')
    expect(relay.dials[0].headers.authorization).toBe('Bearer pass-2')
  })

  it('reconnects when the relay drops the line', async () => {
    const relay = await fakeRelay()
    const onUp = vi.fn()
    startLine(relay.url, onUp)
    await vi.waitFor(() => expect(relay.dials).toHaveLength(1))
    relay.dials[0].ws.terminate()
    await vi.waitFor(() => expect(relay.dials).toHaveLength(2))
    await vi.waitFor(() => expect(onUp).toHaveBeenCalledTimes(2))
  })

  it('once retired with nothing open, closes and dials no more', async () => {
    const relay = await fakeRelay()
    const l = startLine(relay.url)
    await vi.waitFor(() => expect(l.isUp).toBe(true))
    l.retire()
    await vi.waitFor(() => expect(l.isUp).toBe(false))
    await new Promise(r => setTimeout(r, 100))
    expect(relay.dials).toHaveLength(1)
  })
})
