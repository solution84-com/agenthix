/**
 * The relay and the site's proxy environment (spec §6): `proxyDecision` on
 * its own, then the relay over real connections with a stand-in proxy that
 * tunnels `CONNECT` to a stand-in provider. The provider's host name
 * (`provider.test`) resolves nowhere, so a request that reaches it went
 * through the proxy, which sends every tunnel to the stand-in.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import type { ApiKeyRunCredential } from '@agenthix/core'
import { createModelRelayHandler } from '../modelRelayApi'
import { bypassesProxy, proxyDecision } from '../relayProxy'
import { issueRelayToken, pointRelayToken, resetRelayTokensForTests } from '../relayTokens'
import { STANDIN_CERT, STANDIN_KEY } from './standinCert'

type Refusal = { error: { type: string; message: string } }

const at = (url: string) => new URL(url)

describe('proxyDecision', () => {
  it('reads HTTPS_PROXY for https and HTTP_PROXY for http, lower case first', () => {
    expect(proxyDecision(at('https://api.example.com/v1'), {}).kind).toBe('none')
    const secure = proxyDecision(at('https://api.example.com/v1'), { HTTPS_PROXY: 'http://a:1', https_proxy: 'http://b:2' })
    expect(secure.kind === 'tunnel' && secure.proxy.host).toBe('b:2')
    expect(proxyDecision(at('https://api.example.com/v1'), { HTTP_PROXY: 'http://a:1' }).kind).toBe('none')
    expect(proxyDecision(at('https://api.example.com/v1'), { HTTPS_PROXY: 'proxy.corp:3128' }).kind).toBe('tunnel')
  })

  it('never routes an http upstream through a proxy, which would receive the key in clear', () => {
    expect(proxyDecision(at('http://models.lan:8080/v1'), { HTTP_PROXY: 'http://proxy:3128', HTTPS_PROXY: 'http://proxy:3128' })).toEqual({ kind: 'http-direct' })
    expect(proxyDecision(at('http://models.lan:8080/v1'), {}).kind).toBe('none')
  })

  it('bypasses on NO_PROXY: hosts, suffixes with or without a dot, host:port, and *', () => {
    const on = (url: string, noProxy: string) => bypassesProxy(at(url), noProxy)
    expect(on('https://api.example.com', 'api.example.com')).toBe(true)
    expect(on('https://api.example.com', 'example.com')).toBe(true)
    expect(on('https://api.example.com', '.example.com')).toBe(true)
    expect(on('https://api.example.com', '*.example.com')).toBe(true)
    expect(on('https://example.com', '.example.com')).toBe(true)
    expect(on('https://badexample.com', 'example.com')).toBe(false)
    expect(on('https://api.example.com', 'other.org, example.com')).toBe(true)
    expect(on('https://api.example.com', 'other.org example.com')).toBe(true)
    expect(on('https://api.example.com:8443', 'example.com:8443')).toBe(true)
    expect(on('https://api.example.com:9443', 'example.com:8443')).toBe(false)
    expect(on('https://api.example.com', 'example.com:443')).toBe(true)
    expect(on('https://api.example.com', '*')).toBe(true)
    expect(on('https://api.example.com', '')).toBe(false)
  })

  it('always bypasses localhost, 127.0.0.1 and ::1', () => {
    for (const url of ['https://localhost/x', 'https://127.0.0.1:9/x', 'https://[::1]:9/x']) {
      expect(proxyDecision(at(url), { HTTPS_PROXY: 'http://proxy:3128' }).kind, url).toBe('no-proxy-match')
    }
  })

  it('reads a NO_PROXY match as a bypass even when a proxy is set', () => {
    expect(proxyDecision(at('https://api.example.com'), { HTTPS_PROXY: 'http://p:1', no_proxy: 'example.com' }).kind).toBe('no-proxy-match')
  })

  it('reports a proxy setting that is not an address', () => {
    expect(proxyDecision(at('https://api.example.com'), { HTTPS_PROXY: 'socks5://p:1' }).kind).toBe('invalid')
    expect(proxyDecision(at('https://api.example.com'), { HTTPS_PROXY: 'http://[bad' }).kind).toBe('invalid')
  })
})

type Tunnel = { request: string; headers: http.IncomingHttpHeaders; toProvider: Buffer[] }

let provider: https.Server
let providerPort: number
let proxy: http.Server
let proxyUrl: string
let relay: http.Server
let relayUrl: string
let tunnels: Tunnel[]
const tunnelSockets = new Set<{ destroy(): unknown }>()
let proxyStatus: number
let seen: Array<{ url: string; headers: http.IncomingHttpHeaders; body: string }>
let answer: (req: http.IncomingMessage, res: http.ServerResponse) => void
const logs: string[] = []
const env: NodeJS.ProcessEnv = {}

const listen = (server: net.Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))

beforeAll(async () => {
  provider = https.createServer({ cert: STANDIN_CERT, key: STANDIN_KEY }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      seen.push({ url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() })
      answer(req, res)
    })
  })
  providerPort = await listen(provider)

  proxy = http.createServer((_req, res) => { res.writeHead(400); res.end() })
  proxy.on('connect', (req, client, head) => {
    const tunnel: Tunnel = { request: `${req.method} ${req.url}`, headers: req.headers, toProvider: [] }
    tunnels.push(tunnel)
    tunnelSockets.add(client)
    if (proxyStatus !== 200) {
      client.end(`HTTP/1.1 ${proxyStatus} Refused\r\nContent-Length: 0\r\n\r\n`)
      return
    }
    // Every tunnel goes to the stand-in provider, whatever host it names.
    const upstream = net.connect(providerPort, '127.0.0.1', () => {
      tunnelSockets.add(upstream)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    client.on('data', c => tunnel.toProvider.push(c))
    upstream.on('error', () => client.destroy())
    client.on('error', () => upstream.destroy())
  })
  proxyUrl = `http://127.0.0.1:${await listen(proxy)}`

  const handler = createModelRelayHandler({
    checkSource: async () => true,
    upstreamBase: credential => credential.provider === 'openai_compatible'
      ? `http://provider.test:${providerPort}/compat`
      : `https://provider.test:${providerPort}/anthropic`,
    log: line => logs.push(line),
    env,
    tls: { ca: STANDIN_CERT },
  })
  relay = http.createServer((req, res) => { void handler(req, res) })
  relayUrl = `http://127.0.0.1:${await listen(relay)}/api/v1/model-relay`
})

afterAll(async () => {
  for (const s of [relay, proxy, provider]) s.closeAllConnections()
  for (const socket of tunnelSockets) socket.destroy()
  await Promise.all([relay, proxy, provider].map(s => new Promise(r => s.close(r))))
})

const KEYS: ApiKeyRunCredential[] = [
  { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-ant-REAL' },
  { kind: 'apiKey', provider: 'openai_compatible', apiKey: 'sk-compat-REAL', baseUrl: 'http://ignored' },
]
let token: string
beforeEach(() => {
  resetRelayTokensForTests()
  tunnels = []
  seen = []
  logs.length = 0
  proxyStatus = 200
  for (const k of Object.keys(env)) delete env[k]
  answer = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') }
  token = issueRelayToken('c1', 'conv-1')
  pointRelayToken(token, 'run-1', KEYS)
})

/** The relay keeps one pool of tunnels per proxy address, so each test names its own; the query is ignored by the proxy. */
let sequence = 0
const freshProxy = (base = proxyUrl) => `${base}/?test=${++sequence}`

const post = (path: string) =>
  fetch(`${relayUrl}${path}`, { method: 'POST', headers: { 'x-agenthix-turn': token, 'content-type': 'application/json' }, body: '{"model":"m1"}' })

describe('the relay behind a proxy', () => {
  it('reaches an https provider through a CONNECT tunnel, with the key, and keeps the key out of the proxy', async () => {
    env.HTTPS_PROXY = freshProxy()
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(seen[0].headers['x-api-key']).toBe('sk-ant-REAL')
    expect(seen[0].url).toBe('/anthropic/v1/messages')
    expect(tunnels.map(t => t.request)).toEqual([`CONNECT provider.test:${providerPort}`])
    expect(tunnels[0].headers['proxy-authorization']).toBeUndefined()
    expect(Buffer.concat(tunnels[0].toProvider).includes('sk-ant-REAL')).toBe(false)
    expect(logs[0]).toMatch(/ proxy=tunnel outcome=done$/)
  })

  it('sends proxy credentials from the URL to the proxy, and to no log or response', async () => {
    env.HTTPS_PROXY = freshProxy(proxyUrl.replace('http://', 'http://us%40er:p%3Ass@'))
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(200)
    expect(tunnels[0].headers['proxy-authorization']).toBe(`Basic ${Buffer.from('us@er:p:ss').toString('base64')}`)
    expect(seen[0].headers['proxy-authorization']).toBeUndefined()
    expect(logs.join('\n')).not.toMatch(/p%3Ass|p:ss|us%40er|us@er|cDpzcw|sk-ant-REAL/)
  })

  it('streams through the tunnel, each chunk as it comes', async () => {
    env.HTTPS_PROXY = freshProxy()
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    answer = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: one\n\n')
      void gate.then(() => res.end('data: two\n\n'))
    }
    const res = await post('/anthropic/v1/messages')
    const reader = res.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: one\n\n')
    release()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: two\n\n')
  })

  it('reuses a tunnel for the next request, as a direct connection is', async () => {
    env.HTTPS_PROXY = freshProxy()
    await post('/anthropic/v1/messages')
    await post('/anthropic/v1/messages')
    expect(seen).toHaveLength(2)
    expect(tunnels).toHaveLength(1)
  })

  it('goes direct for a host NO_PROXY names', async () => {
    env.HTTPS_PROXY = freshProxy()
    env.NO_PROXY = 'provider.test'
    const res = await post('/anthropic/v1/messages')
    // provider.test resolves nowhere: direct is unreachable, and the proxy was not asked.
    expect(res.status).toBe(502)
    expect(tunnels).toEqual([])
    expect(logs[0]).toMatch(/proxy=no-proxy-match outcome=unreachable/)
  })

  it('never sends a keyed http request to a proxy: it goes direct', async () => {
    env.HTTP_PROXY = proxyUrl
    env.HTTPS_PROXY = freshProxy()
    const res = await post('/openai_compatible/chat/completions')
    expect(res.status).toBe(502)
    expect(tunnels).toEqual([])
    expect(seen).toEqual([])
    expect(logs[0]).toMatch(/proxy=http-direct outcome=unreachable/)
  })

  it('answers 502 when the proxy is down, like an unreachable provider', async () => {
    const closed = net.createServer()
    const port = await listen(closed)
    await new Promise(r => closed.close(r))
    env.HTTPS_PROXY = `http://dan:secret@127.0.0.1:${port}`
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(502)
    expect((await res.json() as Refusal).error.message).toBe('The provider could not be reached')
    expect(logs[0]).toMatch(/proxy=tunnel outcome=unreachable \(ECONNREFUSED\)$/)
    expect(logs.join('\n')).not.toMatch(/secret|dan|sk-ant-REAL/)
  })

  it('answers 502 when the proxy refuses the tunnel', async () => {
    env.HTTPS_PROXY = freshProxy()
    proxyStatus = 407
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(502)
    expect(seen).toEqual([])
    expect(logs[0]).toMatch(/proxy=tunnel outcome=unreachable/)
  })

  it('answers 502 for a proxy setting that is not an address, without contacting the provider', async () => {
    env.HTTPS_PROXY = 'socks5://proxy:1080'
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(502)
    expect(seen).toEqual([])
    expect(logs[0]).toMatch(/proxy=invalid outcome=proxy-setting-invalid$/)
    expect(logs[0]).not.toMatch(/socks5/)
  })
})
