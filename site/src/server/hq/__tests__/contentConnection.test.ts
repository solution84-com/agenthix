import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { StreamMux, SITE_PROTOCOL_VERSION, SITE_PROTOCOL_VERSION_HEADER, type StreamEvents } from '@agenthix/core'
import { ContentConnection } from '../content/contentConnection'
import type { ContentHandler } from '../content/contentMethods'

let server: http.Server | null = null
let conn: ContentConnection | null = null

afterEach(async () => {
  conn?.stop()
  conn = null
  if (server) await new Promise<void>(r => server!.close(() => r()))
  server = null
})

/** A fake hq: accepts one content connection and hands back an opener mux. */
async function fakeHq(opts: { refuseWith?: { status: number; required?: string } } = {}) {
  let resolveMux!: (m: { mux: StreamMux; ws: WebSocket; headers: http.IncomingHttpHeaders }) => void
  const connected = new Promise<{ mux: StreamMux; ws: WebSocket; headers: http.IncomingHttpHeaders }>(r => { resolveMux = r })
  const wss = new WebSocketServer({ noServer: true })
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket, head) => {
    if (opts.refuseWith) {
      const extra = opts.refuseWith.required ? `${SITE_PROTOCOL_VERSION_HEADER}: ${opts.refuseWith.required}\r\n` : ''
      socket.write(`HTTP/1.1 ${opts.refuseWith.status} Refused\r\n${extra}Connection: close\r\n\r\n`)
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
      resolveMux({ mux, ws, headers: req.headers })
    })
  })
  await new Promise<void>(r => server!.listen(0, r))
  const port = (server!.address() as { port: number }).port
  return { url: `ws://127.0.0.1:${port}/hq-content`, connected }
}

function openOn(mux: StreamMux, method: string): { accepted: Promise<void>; data: Buffer[]; ended: Promise<void>; error: Promise<string>; id: number } {
  const data: Buffer[] = []
  let accept!: () => void, end!: () => void, fail!: (s: string) => void
  const accepted = new Promise<void>(r => { accept = r })
  const ended = new Promise<void>(r => { end = r })
  const error = new Promise<string>(r => { fail = r })
  const events: StreamEvents = {
    onAccept: () => accept(),
    onData: p => data.push(Buffer.from(p)),
    onEnd: () => end(),
    onError: (code, message) => fail(`${code}: ${message}`),
  }
  const id = mux.open(method, { path: 'a.md' }, events)
  return { accepted, data, ended, error, id }
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('ContentConnection', () => {
  it('dials with the site\'s credential, id and protocol version', async () => {
    const hq = await fakeHq()
    conn = new ContentConnection({ url: hq.url, token: 'tok', siteId: 's1', methods: {} })
    conn.start()
    const { headers } = await hq.connected
    expect(headers.authorization).toBe('Bearer tok')
    expect(headers['x-site-id']).toBe('s1')
    expect(headers['x-site-protocol-version']).toBe(SITE_PROTOCOL_VERSION)
  })

  it('serves a registered method: hq reads what the handler writes, whole', async () => {
    const payload = randomBytes(3 * 1024 * 1024)
    const read: ContentHandler = async stream => {
      await new Promise<void>((resolve, reject) => stream.end(payload, (e?: Error) => (e ? reject(e) : resolve())))
    }
    const hq = await fakeHq()
    conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: { 'files.read': read } })
    conn.start()
    const { mux } = await hq.connected

    const s = openOn(mux, 'files.read')
    await s.accepted
    await s.ended
    expect(sha(Buffer.concat(s.data))).toBe(sha(payload))
  })

  it('passes hq\'s params to the handler', async () => {
    let seen: unknown
    const hq = await fakeHq()
    conn = new ContentConnection({
      url: hq.url, token: 't', siteId: 's1',
      methods: { 'files.read': async (stream, params) => { seen = params; stream.end() } },
    })
    conn.start()
    const { mux } = await hq.connected
    await openOn(mux, 'files.read').ended
    expect(seen).toEqual({ path: 'a.md' })
  })

  it('refuses a method it does not have — the registry is closed', async () => {
    const hq = await fakeHq()
    conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: {} })
    conn.start()
    const { mux } = await hq.connected
    expect(await openOn(mux, 'relay.anything').error).toBe('unknown_method: Unknown method: relay.anything')
  })

  it('reports a handler that throws as handler_failed, with its message and not its stack', async () => {
    const hq = await fakeHq()
    conn = new ContentConnection({
      url: hq.url, token: 't', siteId: 's1',
      methods: { boom: async () => { throw new Error('disk full') } },
    })
    conn.start()
    const { mux } = await hq.connected
    expect(await openOn(mux, 'boom').error).toBe('handler_failed: disk full')
  })

  it('reports a 426 as a version mismatch, passing on the version hq states, and does not treat it as a network failure', async () => {
    const hq = await fakeHq({ refuseWith: { status: 426, required: '3.0' } })
    let stated: string | undefined | null = null
    conn = new ContentConnection({
      url: hq.url, token: 't', siteId: 's1', methods: {},
      onVersionMismatch: v => { stated = v },
    })
    conn.start()
    for (let i = 0; i < 100 && stated === null; i++) await new Promise(r => setTimeout(r, 10))
    expect(stated).toBe('3.0')
  })

  it('stops reconnecting once stopped', async () => {
    const hq = await fakeHq()
    conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: {} })
    conn.start()
    const { ws } = await hq.connected
    conn.stop()
    await new Promise(r => setTimeout(r, 50))
    expect(conn.isConnected).toBe(false)
    expect(ws.readyState).not.toBe(1)
  })

  it('a finished handler\'s stream with no error listener does not crash the site when the connection stops', async () => {
    const hq = await fakeHq()
    let handlerStream: import('node:stream').Duplex | null = null
    conn = new ContentConnection({
      url: hq.url, token: 't', siteId: 's1',
      methods: { 'files.read': async stream => { handlerStream = stream; stream.end(Buffer.from('x')) } },
    })
    conn.start()
    const { mux } = await hq.connected
    await openOn(mux, 'files.read').ended

    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.on('uncaughtException', onUncaught)
    try {
      conn.stop()
      conn = null
      await new Promise(r => setTimeout(r, 30))
      expect(handlerStream!.destroyed).toBe(true)
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })

  it('a handler that .pipe()s into its stream and never finishes does not crash the site when the connection stops', async () => {
    const hq = await fakeHq()
    const source = new Readable({ read() { this.push(Buffer.alloc(64 * 1024)) } })
    let piping!: () => void
    const started = new Promise<void>(r => { piping = r })
    conn = new ContentConnection({
      url: hq.url, token: 't', siteId: 's1',
      methods: {
        'files.read': stream => {
          source.pipe(stream)
          piping()
          return new Promise<void>(() => {})
        },
      },
    })
    conn.start()
    const { mux } = await hq.connected
    openOn(mux, 'files.read')
    await started
    await new Promise(r => setTimeout(r, 20))

    // pipe() attaches its own 'error' listener, then removes it and re-throws
    // when it finds nobody else listening — so a listener count is no guard.
    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.on('uncaughtException', onUncaught)
    try {
      conn.stop()
      conn = null
      await new Promise(r => setTimeout(r, 50))
      expect(uncaught).toEqual([])
    } finally {
      source.destroy()
      process.off('uncaughtException', onUncaught)
    }
  })

  it('reports a handler that throws synchronously as handler_failed, without crashing the site', async () => {
    const hq = await fakeHq()
    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.on('uncaughtException', onUncaught)
    try {
      conn = new ContentConnection({
        url: hq.url, token: 't', siteId: 's1',
        methods: { boom: (() => { throw new Error('boom') }) as unknown as ContentHandler },
      })
      conn.start()
      const { mux } = await hq.connected
      expect(await openOn(mux, 'boom').error).toBe('handler_failed: boom')
      await new Promise(r => setTimeout(r, 20))
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })

  it('reads a request through to its end, then writes a response on the same stream', async () => {
    const digest: ContentHandler = async stream => {
      const hash = createHash('sha256')
      // Not `for await`: a completed async iteration destroys the stream, and
      // this handler still has its response to write.
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => hash.update(chunk))
        stream.once('end', resolve)
        stream.once('error', reject)
      })
      await new Promise<void>((resolve, reject) =>
        stream.end(Buffer.from(hash.digest('hex')), (e?: Error) => (e ? reject(e) : resolve())))
    }
    const hq = await fakeHq()
    conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: { 'files.digest': digest } })
    conn.start()
    const { mux } = await hq.connected

    const payload = randomBytes(1024 * 1024)
    const s = openOn(mux, 'files.digest')
    await s.accepted
    await mux.write(s.id, payload)
    mux.end(s.id)
    await s.ended
    expect(Buffer.concat(s.data).toString()).toBe(sha(payload))
  })
})

/** A fake hq that accepts every content upgrade and counts them, sending nothing unless asked to ping. */
async function silentHq(opts: { pingEveryMs?: number } = {}) {
  const wss = new WebSocketServer({ noServer: true })
  const state = { upgrades: 0, closes: 0 }
  const timers: Array<ReturnType<typeof setInterval>> = []
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', (req, socket, head) => {
    state.upgrades++
    wss.handleUpgrade(req, socket, head, ws => {
      if (opts.pingEveryMs) {
        const t = setInterval(() => ws.ping(), opts.pingEveryMs)
        timers.push(t)
        ws.on('close', () => clearInterval(t))
      }
      ws.on('close', () => { state.closes++ })
    })
  })
  await new Promise<void>(r => server!.listen(0, r))
  const port = (server!.address() as { port: number }).port
  return {
    url: `ws://127.0.0.1:${port}/hq-content`,
    state,
    close: () => {
      for (const t of timers) clearInterval(t)
      for (const c of wss.clients) c.terminate()
      wss.close()
    },
  }
}

async function until(check: () => boolean, ms: number) {
  for (const deadline = Date.now() + ms; Date.now() < deadline && !check();) await new Promise(r => setTimeout(r, 10))
}

describe('ContentConnection silence watchdog', () => {
  it('gives up on a connection that hears nothing, and reconnects', async () => {
    const hq = await silentHq()
    try {
      conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: {}, silenceTimeoutMs: 100 })
      conn.start()
      // The site terminates within the timeout; the redial then waits out the
      // ordinary reconnect delay, which this does not shorten.
      await until(() => hq.state.closes >= 1, 1_000)
      expect(hq.state.closes).toBe(1)
      await until(() => hq.state.upgrades >= 2, 7_000)
      expect(hq.state.upgrades).toBe(2)
    } finally {
      conn?.stop()
      conn = null
      hq.close()
    }
  }, 10_000)

  it('keeps a connection that hq keeps pinging', async () => {
    const hq = await silentHq({ pingEveryMs: 30 })
    try {
      conn = new ContentConnection({ url: hq.url, token: 't', siteId: 's1', methods: {}, silenceTimeoutMs: 100 })
      conn.start()
      await until(() => hq.state.upgrades >= 1, 1_000)
      await new Promise(r => setTimeout(r, 400))
      expect(hq.state.upgrades).toBe(1)
      expect(hq.state.closes).toBe(0)
      expect(conn.isConnected).toBe(true)
    } finally {
      conn?.stop()
      conn = null
      hq.close()
    }
  })
})
