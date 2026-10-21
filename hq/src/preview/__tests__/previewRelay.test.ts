/**
 * The agent that turns a `preview.connect` stream into something an ordinary
 * HTTP proxy can forward over (ADR-0063).
 *
 * Two things are worth a test here and both are real rather than mocked:
 *
 *  1. **One stream per connection, and never one shared between previews.** A
 *     pooled socket reused across previews would carry one boundary's bytes to
 *     another person's viewer, and nothing above this could catch it. So the
 *     agent is checked for opening a fresh stream every time, and for being
 *     unable to name any preview but its own.
 *  2. **A `Duplex` that is not a socket really does carry an HTTP request and
 *     a WebSocket upgrade.** The upstream here is a real HTTP server reached
 *     through a `Duplex` that wraps a socket rather than being one — which is
 *     exactly the shape a content stream has — and the upgrade goes through
 *     `http-proxy` itself, because that is what calls `setTimeout`,
 *     `setNoDelay` and `setKeepAlive` on the upstream connection and would
 *     otherwise throw out of an event handler and take the process down.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { Duplex } from 'node:stream'
import httpProxy from 'http-proxy'
import { previewStreamAgent } from '../previewRelay'

let upstream: http.Server
let upstreamPort: number

/**
 * Every socket either end of this file opened. An upgraded connection is
 * detached from the server that accepted it, so neither `close` nor
 * `closeAllConnections` reaches it and the suite would never end; each one is
 * destroyed by hand instead.
 */
const opened: net.Socket[] = []

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`hello ${req.url}`)
  })
  upstream.on('upgrade', (_req, socket) => {
    opened.push(socket as net.Socket)
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.on('data', chunk => socket.write(`echo:${chunk.toString()}`))
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  upstreamPort = (upstream.address() as net.AddressInfo).port
})

afterAll(async () => {
  for (const socket of opened) socket.destroy()
  opened.length = 0
  upstream.closeAllConnections()
  await new Promise<void>(resolve => upstream.close(() => resolve()))
})

/**
 * A content stream stands in as a `Duplex` wrapping a socket rather than being
 * one — the same shape `ContentStream` has, and the shape the whole trick
 * depends on.
 */
function streamToUpstream(): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(upstreamPort, '127.0.0.1')
    opened.push(socket)
    socket.once('error', reject)
    socket.once('connect', () => {
      const duplex = new Duplex({
        allowHalfOpen: true,
        read() {},
        write(chunk, _enc, cb) {
          socket.write(chunk as Buffer, cb)
        },
        final(cb) {
          socket.end()
          cb()
        },
        destroy(err, cb) {
          socket.destroy()
          cb(err)
        },
      })
      socket.on('data', chunk => duplex.push(chunk))
      socket.on('end', () => duplex.push(null))
      socket.on('error', err => duplex.destroy(err))
      resolve(duplex)
    })
  })
}

function get(agent: http.Agent, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 80, path, agent }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => (body += chunk))
      res.on('end', () => resolve(`${res.statusCode} ${body}`))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('previewStreamAgent', () => {
  it('carries an ordinary HTTP request over a stream that is not a socket', async () => {
    const open = vi.fn((_siteId: string, _method: string, _params: unknown) => streamToUpstream())
    const agent = previewStreamAgent('site-b', 'pv1', open)
    await expect(get(agent, '/index.html')).resolves.toBe('200 hello /index.html')
  })

  it('opens one stream per connection and never reuses one across previews', async () => {
    const open = vi.fn((_siteId: string, _method: string, _params: unknown) => streamToUpstream())
    const agent = previewStreamAgent('site-b', 'pv1', open)
    await Promise.all([get(agent, '/a'), get(agent, '/b')])
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledWith('site-b', 'preview.connect', { previewId: 'pv1' })

    // Sequentially too: the agent must not keep a finished connection for the
    // next request, which is what an http.Agent does by default.
    await get(agent, '/c')
    await get(agent, '/d')
    expect(open).toHaveBeenCalledTimes(4)
  })

  it('ignores the destination it is handed and names its own preview', async () => {
    const open = vi.fn((_siteId: string, _method: string, _params: unknown) => streamToUpstream())
    const agent = previewStreamAgent('site-b', 'pv1', open)

    // What a caller further up could put in the request options if the agent
    // read them. It does not: the only address in play is the one the site
    // resolves from its own registry for this previewId.
    const handed = await new Promise<unknown>(resolve => {
      agent.createConnection(
        { host: 'somewhere.else', port: 22, path: '/', hostname: 'somewhere.else' },
        (err, stream) => resolve(err ?? stream),
      )
    })

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('site-b', 'preview.connect', { previewId: 'pv1' })
    expect(await open.mock.results[0].value).toBe(handed)
  })

  it('never keeps a finished connection, whatever its options say', () => {
    const agent = previewStreamAgent('site-b', 'pv1', streamToUpstream)
    // The hook node calls before pooling a socket. Returning false is what
    // makes "one stream per connection" hold even if the agent were ever
    // constructed with keepAlive on — belt and braces over `keepAlive: false`,
    // which is what enforces it today.
    expect(agent.keepSocketAlive(new Duplex({ read() {}, write(_c, _e, cb) { cb() } })) as unknown).toBe(false)
  })

  it('surfaces an unreachable site as a request error naming the site, not an empty page', async () => {
    // A cause that names neither the site nor the preview, so the wrapping is
    // what has to carry them — an operator reading a 502 has only this.
    const open = vi.fn(async (_siteId: string, _method: string, _params: unknown): Promise<Duplex> => {
      throw new Error('no content connection')
    })
    const agent = previewStreamAgent('site-b', 'pv1', open)
    // What the proxy turns into `502 preview upstream error: <this>`.
    const failure = await get(agent, '/').then(() => null, (err: Error) => err)
    expect(failure?.message).toMatch(/Execution Site site-b/)
    expect(failure?.message).toMatch(/preview pv1/)
    expect(failure?.message).toMatch(/no content connection/)
  })

  it('carries a WebSocket upgrade through http-proxy, which a bare Duplex cannot', async () => {
    const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })
    const front = http.createServer()
    let frontSocket: net.Socket | null = null
    front.on('upgrade', (req, socket, head) => {
      frontSocket = socket as net.Socket
      socket.on('error', () => {})
      proxy.ws(req, socket, head, {
        target: 'http://127.0.0.1',
        agent: previewStreamAgent('site-b', 'pv1', streamToUpstream),
      }, () => socket.destroy())
    })
    await new Promise<void>(resolve => front.listen(0, '127.0.0.1', resolve))
    const frontPort = (front.address() as net.AddressInfo).port

    let clientSocket: net.Socket | null = null
    try {
      const echoed = await new Promise<string>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: frontPort,
          path: '/hmr',
          headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
        })
        req.on('upgrade', (_res, socket) => {
          clientSocket = socket as net.Socket
          socket.on('data', chunk => resolve(chunk.toString()))
          socket.on('error', reject)
          socket.write('PING')
        })
        req.on('response', res => reject(new Error(`no upgrade, status ${res.statusCode}`)))
        req.on('error', reject)
        req.end()
      })
      expect(echoed).toBe('echo:PING')
    } finally {
      // An upgraded socket is detached from the server that accepted it, so
      // `closeAllConnections` does not reach it and `close` would wait forever.
      ;(clientSocket as net.Socket | null)?.destroy()
      ;(frontSocket as net.Socket | null)?.destroy()
      proxy.close()
      front.closeAllConnections()
      await new Promise<void>(resolve => front.close(() => resolve()))
    }
  })
})
