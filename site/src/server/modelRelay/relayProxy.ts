/**
 * The model relay's use of the site's proxy environment (spec §6). Node's
 * `http`/`https` ignore `HTTPS_PROXY` unless the process opts in with
 * `NODE_USE_ENV_PROXY` (Node 24.5 and later), which the site does not, so a
 * site that reaches the internet only through a proxy needs this. It is a `CONNECT` tunnel and a `NO_PROXY`
 * matcher, on `node:http` and `node:tls`, rather than a new dependency.
 *
 * An `https:` upstream goes through a `CONNECT` tunnel, so the provider's key is
 * inside TLS end to end and the proxy sees only the host and port. An `http:`
 * upstream is never sent through a proxy: the proxy would receive the key in
 * clear. That request goes direct, as it would with no proxy configured.
 */
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import type { Duplex } from 'node:stream'

export type ProxyDecision =
  | { kind: 'none' }
  | { kind: 'no-proxy-match' }
  | { kind: 'http-direct' }
  | { kind: 'invalid' }
  | { kind: 'tunnel'; proxy: URL }

/** What the relay's log line says about the route; never the proxy's address or credentials. */
export function describeRoute(decision: ProxyDecision): string {
  return decision.kind === 'tunnel' ? 'tunnel' : decision.kind
}

const ALWAYS_DIRECT = new Set(['localhost', '127.0.0.1', '::1'])

function setting(env: NodeJS.ProcessEnv, lower: string): string {
  return (env[lower] || env[lower.toUpperCase()] || '').trim()
}

const bare = (host: string) => host.replace(/^\[|\]$/g, '').toLowerCase()

/** `NO_PROXY`: comma or space separated hosts, domain suffixes (leading `.` or `*.` optional), `host:port`, and `*`. */
export function bypassesProxy(target: URL, noProxy: string): boolean {
  const host = bare(target.hostname)
  if (ALWAYS_DIRECT.has(host) || host.endsWith('.localhost')) return true
  const port = target.port || (target.protocol === 'https:' ? '443' : '80')
  for (const raw of noProxy.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    if (raw === '*') return true
    let entry = raw
    let entryPort = ''
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(entry)
    if (m) { entry = m[1]; entryPort = m[2] }
    if (entryPort && entryPort !== port) continue
    entry = bare(entry).replace(/^\*?\./, '')
    if (entry && (host === entry || host.endsWith(`.${entry}`))) return true
  }
  return false
}

export function proxyDecision(target: URL, env: NodeJS.ProcessEnv = process.env): ProxyDecision {
  const secure = target.protocol === 'https:'
  const configured = setting(env, secure ? 'https_proxy' : 'http_proxy')
  if (!configured) return { kind: 'none' }
  if (bypassesProxy(target, setting(env, 'no_proxy'))) return { kind: 'no-proxy-match' }
  if (!secure) return { kind: 'http-direct' }
  try {
    const proxy = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`)
    if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') return { kind: 'invalid' }
    return { kind: 'tunnel', proxy }
  } catch {
    return { kind: 'invalid' }
  }
}

type CreateConnectionCallback = (err: Error | null, stream: Duplex) => void

/** Node's convention for a failed connection is `callback(err)` alone; its declared type wants a stream too. */
const failWith = (callback: CreateConnectionCallback, err: Error) => (callback as (err: Error) => void)(err)

/** A failure opening the tunnel, carrying a code and nothing of the proxy's address or credentials. */
function tunnelError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`The provider could not be reached through the proxy (${code})`), { code })
}

/** How long a proxy has to answer a `CONNECT` before the tunnel is given up. */
const TUNNEL_CONNECT_TIMEOUT_MS = 30_000

/** An `https.Agent` whose connections are `CONNECT` tunnels through one proxy, keep-alive as for a direct connection. */
export class TunnelAgent extends https.Agent {
  constructor(private readonly proxy: URL, private readonly tlsOptions: tls.ConnectionOptions = {}) {
    super({ keepAlive: true })
  }

  // The async form of createConnection is documented for Agent subclasses; the base class's types predate it.
  createConnection(options: http.RequestOptions & { servername?: string }, callback?: CreateConnectionCallback): Duplex | undefined {
    if (!callback) throw new Error('TunnelAgent connects asynchronously')
    const host = String(options.host ?? options.hostname ?? '')
    const port = Number(options.port) || 443
    const authority = `${host.includes(':') ? `[${host}]` : host}:${port}`
    const headers: Record<string, string> = { host: authority }
    if (this.proxy.username || this.proxy.password) {
      const credentials = `${decodeURIComponent(this.proxy.username)}:${decodeURIComponent(this.proxy.password)}`
      headers['proxy-authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`
    }
    const secureProxy = this.proxy.protocol === 'https:'
    const request = (secureProxy ? https : http).request({
      host: bare(this.proxy.hostname),
      port: this.proxy.port || (secureProxy ? 443 : 80),
      method: 'CONNECT',
      path: authority,
      headers,
      agent: false,
      ...(secureProxy ? this.tlsOptions : {}),
    })
    let settled = false
    // A plain timer, not the request's own timeout: that one stays on the socket handed out below.
    const deadline = setTimeout(() => {
      request.destroy()
      fail('timeout')
    }, TUNNEL_CONNECT_TIMEOUT_MS)
    const fail = (code: string) => {
      clearTimeout(deadline)
      if (settled) return
      settled = true
      failWith(callback, tunnelError(code))
    }
    request.on('error', err => fail((err as NodeJS.ErrnoException).code ?? 'error'))
    request.on('connect', (response, socket) => {
      clearTimeout(deadline)
      if (response.statusCode !== 200) {
        socket.destroy()
        return fail(`proxy answered ${response.statusCode}`)
      }
      if (settled) return socket.destroy()
      settled = true
      const secured = tls.connect({ ...this.tlsOptions, socket, servername: options.servername ?? (/^[\d.]+$|:/.test(host) ? undefined : host) })
      const failed = (err: Error) => {
        secured.destroy()
        failWith(callback, tunnelError((err as NodeJS.ErrnoException).code ?? 'tls'))
      }
      secured.once('error', failed)
      secured.once('secureConnect', () => {
        secured.removeListener('error', failed)
        callback(null, secured)
      })
    })
    request.end()
    return undefined
  }
}
