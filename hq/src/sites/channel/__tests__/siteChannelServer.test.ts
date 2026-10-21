// Over 300 lines on purpose: every case runs over the one live http server, ws server and client set up below.
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import { SITE_PROTOCOL_VERSION, HQ_SITE_CHANNEL_PATH, HQ_SITE_UNKNOWN_HEADER, parseProtocolVersion, type HQConnectionMessage } from '@agenthix/core'
import { attachSiteChannel } from '../siteChannelServer'
import { SiteChannelRegistry } from '../siteChannelRegistry'
import type { SiteStatusStore } from '../siteStatusStore'
import type { SiteChannelDeps } from '../siteChannelServer'

// Indexed against SiteChannelDeps itself rather than duplicating its
// `onSiteEvent` method signature — `onSiteEvent` has no standalone exported
// type name (it's a method member), so this is the same move
// reconcileService.test.ts makes against its own exported `EmitStatus` alias.
type OnSiteEvent = SiteChannelDeps['onSiteEvent']

// A real http server, a real ws server and a real client. Only the two things
// that genuinely need a database are injected — a mocked socket would prove
// nothing about an HTTP upgrade, a header, or a frame on a wire.
const noopStore: SiteStatusStore = {
  markOnline: async () => {},
  markOffline: async () => {},
  touch: async () => {},
  recordProtocolVersion: async () => {},
  markVersionMismatch: async () => {},
}

let server: http.Server
let registry: SiteChannelRegistry
let port: number
let sockets: Set<import('node:net').Socket>
// Typed against OnSiteEvent (SiteChannelDeps['onSiteEvent']) rather than the
// untyped `ReturnType<typeof vi.fn>` vitest defaults to — the Wasp SDK
// build's tsc is stricter than the app's own `npm run typecheck` and refuses to
// pass an untyped Mock where attachSiteChannel expects this exact signature.
let onSiteEvent: Mock<OnSiteEvent>

beforeEach(async () => {
  registry = new SiteChannelRegistry(noopStore)
  server = http.createServer((_req, res) => res.end('ok'))
  // An upgrade this handler declines is left open on purpose — in production
  // socket.io picks it up — and once a socket is handed to an 'upgrade'
  // listener the http server no longer tracks it, so server.close() would wait
  // on it forever. Track every connection ourselves and destroy them here.
  sockets = new Set()
  server.on('connection', s => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  onSiteEvent = vi.fn<OnSiteEvent>().mockResolvedValue(undefined)
  attachSiteChannel(server, {
    registry,
    // 'good' is the only credential this hq accepts; 's-revoked' is refused
    // the way authenticateSite refuses a revoked row.
    authenticate: async (siteId, credential) =>
      credential === 'good' && siteId !== 's-revoked' && siteId !== 'ghost' ? { siteId } : null,
    siteExists: async siteId => siteId !== 'ghost',
    onSiteEvent,
    recordProtocolVersion: async () => {},
    markVersionMismatch: async () => {},
  })
  await new Promise<void>(resolve => server.listen(0, resolve))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const s of sockets) s.destroy()
  sockets.clear()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

function dial(headers: Record<string, string>, path = HQ_SITE_CHANNEL_PATH): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers })
}

const goodHeaders = {
  'Authorization': 'Bearer good',
  'X-Site-Id': 's1',
  'X-Site-Protocol-Version': String(SITE_PROTOCOL_VERSION),
}

function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
}

function refusalHeaders(ws: WebSocket): Promise<{ status: number; unknown: string | undefined }> {
  return new Promise(resolve => {
    ws.once('unexpected-response', (_req, res) => resolve({ status: res.statusCode ?? 0, unknown: res.headers[HQ_SITE_UNKNOWN_HEADER.toLowerCase()] as string | undefined }))
    ws.once('error', () => {})
  })
}

function rejected(ws: WebSocket): Promise<string> {
  return new Promise(resolve => {
    ws.once('unexpected-response', (_req, res) => resolve(`${res.statusCode}`))
    ws.once('error', err => resolve(err.message))
  })
}

describe('control-channel handshake @SC-290', () => {
  it('accepts a site presenting its machine credential', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)
    expect(registry.isOnline('s1')).toBe(true)
    ws.close()
  })

  it('refuses a wrong credential', async () => {
    expect(await rejected(dial({ ...goodHeaders, Authorization: 'Bearer wrong' }))).toBe('401')
  })

  it('refuses a revoked site', async () => {
    expect(await rejected(dial({ ...goodHeaders, 'X-Site-Id': 's-revoked' }))).toBe('401')
  })

  it('says a site id hq has no record of is unknown, and no other refusal does', async () => {
    expect(await refusalHeaders(dial({ ...goodHeaders, 'X-Site-Id': 'ghost' }))).toEqual({ status: 401, unknown: '1' })
    expect(await refusalHeaders(dial({ ...goodHeaders, Authorization: 'Bearer wrong' }))).toEqual({ status: 401, unknown: undefined })
    expect(await refusalHeaders(dial({ ...goodHeaders, 'X-Site-Id': 's-revoked' }))).toEqual({ status: 401, unknown: undefined })
  })

  it('refuses a connection carrying no credential at all', async () => {
    const { Authorization: _drop, ...headers } = goodHeaders
    expect(await rejected(dial(headers))).toBe('401')
  })
})

describe('control-channel handshake @SC-291', () => {
  const { major, minor } = parseProtocolVersion(SITE_PROTOCOL_VERSION)!

  it('refuses a site two or more majors apart, behind or ahead', async () => {
    expect(await rejected(dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major + 3}.0` }))).toBe('426')
    expect(await rejected(dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major + 2}.0` }))).toBe('426')
  })

  it('accepts a site one major apart, behind or ahead', async () => {
    for (const version of [`${major - 1}.3`, `${major + 1}.0`]) {
      const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': version })
      await opened(ws)
      ws.close()
    }
  })

  it('refuses a version header that is not a version', async () => {
    expect(await rejected(dial({ ...goodHeaders, 'X-Site-Protocol-Version': String(major) }))).toBe('426')
    expect(await rejected(dial({ ...goodHeaders, 'X-Site-Protocol-Version': 'six' }))).toBe('426')
  })

  it('accepts a lower minor and speaks it', async () => {
    // A site one release behind must still connect — hq and a site are
    // deployed on separate schedules, so this is ordinary, not an edge case.
    const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major}.${minor}` })
    await opened(ws)
    expect(registry.get('s1')?.protocol).toEqual({ major, minor })
    ws.close()
  })

  it('accepts a higher minor but speaks its own', async () => {
    // A site ahead of hq may know message types hq does not. Speaking hq's
    // own version is what stops hq claiming a capability it cannot honour.
    const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major}.${minor + 5}` })
    await opened(ws)
    expect(registry.get('s1')?.protocol).toEqual({ major, minor })
    ws.close()
  })

  it('keeps the whole version it speaks with a site one major behind, not only its minor', async () => {
    const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major - 1}.3` })
    await opened(ws)
    expect(registry.get('s1')?.protocol).toEqual({ major: major - 1, minor: 3 })
    ws.close()
  })

  it('speaks its own version with a site one major ahead', async () => {
    const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major + 1}.2` })
    await opened(ws)
    expect(registry.get('s1')?.protocol).toEqual({ major, minor })
    ws.close()
  })

  it('stamps what it sends with the version it speaks on that connection', async () => {
    const ws = dial({ ...goodHeaders, 'X-Site-Protocol-Version': `${major - 1}.3` })
    await opened(ws)
    const frame = new Promise<HQConnectionMessage>(resolve => ws.once('message', raw => resolve(JSON.parse(raw.toString()))))
    void registry.request('s1', 'site.describe', {}, 250).catch(() => {})
    expect((await frame).version).toBe(`${major - 1}.3`)
    ws.close()
  })
})

describe('control-channel handshake @SC-292', () => {
  it('leaves upgrades on other paths alone', async () => {
    // socket.io owns the same http server. An upgrade this handler does not
    // recognise must be left untouched, not destroyed — destroying it here
    // would break every browser's socket.io connection.
    const ws = dial(goodHeaders, '/socket.io/')
    const outcome = await Promise.race([
      rejected(ws),
      new Promise<string>(resolve => setTimeout(() => resolve('left-alone'), 300)),
    ])
    expect(outcome).toBe('left-alone')
    ws.terminate()
  })
})

describe('round trip over a live connection @SC-295', () => {
  it('asks a connected site a question and receives its answer', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as HQConnectionMessage
      if (msg.type !== 'channel.request') return
      ws.send(JSON.stringify({
        version: SITE_PROTOCOL_VERSION,
        type: 'channel.response',
        siteId: 's1',
        replyTo: msg.requestId,
        payload: { siteId: 's1', name: 'Box', protocolVersion: SITE_PROTOCOL_VERSION, startedAt: 'now' },
      }))
    })

    await expect(registry.request('s1', 'site.describe', {}))
      .resolves.toMatchObject({ name: 'Box' })
    ws.close()
  })

  it('refuses a frame that claims to speak for a different site', async () => {
    // The socket was authenticated as one siteId. A frame naming another is
    // dropped rather than trusted, so one site cannot answer for its sibling.
    const ws = dial(goodHeaders)
    await opened(ws)

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as HQConnectionMessage
      if (msg.type !== 'channel.request') return
      ws.send(JSON.stringify({
        version: SITE_PROTOCOL_VERSION,
        type: 'channel.response',
        siteId: 'someone-else',
        replyTo: msg.requestId,
        payload: { hijacked: true },
      }))
    })

    await expect(registry.request('s1', 'site.describe', {}, 250))
      .rejects.toMatchObject({ code: 'timeout' })
    ws.close()
  })
})

describe('frames on a live connection @SC-291', () => {
  const { major } = parseProtocolVersion(SITE_PROTOCOL_VERSION)!

  function answerWith(ws: WebSocket, version: string): void {
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as HQConnectionMessage
      if (msg.type !== 'channel.request') return
      ws.send(JSON.stringify({ version, type: 'channel.response', siteId: 's1', replyTo: msg.requestId, payload: { name: 'Box' } }))
    })
  }

  it('drops a frame of a major two apart, or one that is not a version', async () => {
    for (const version of [`${major + 2}.0`, `${major + 3}.0`, 'six']) {
      const ws = dial(goodHeaders)
      await opened(ws)
      answerWith(ws, version)
      await expect(registry.request('s1', 'site.describe', {}, 250)).rejects.toMatchObject({ code: 'timeout' })
      ws.close()
    }
  })

  it('reads a frame of a major one apart', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)
    answerWith(ws, `${major - 1}.0`)
    await expect(registry.request('s1', 'site.describe', {})).resolves.toMatchObject({ name: 'Box' })
    ws.close()
  })
})

describe('round trip over a live connection @SC-296', () => {
  it('answers a request from the site with an explicit refusal', async () => {
    // hq exposes no methods over this socket — spec §4b routes site -> hq
    // calls over ordinary HTTPS. Refusing plainly beats a silent drop, which
    // the caller would only ever see as a timeout.
    const ws = dial(goodHeaders)
    await opened(ws)

    const reply = new Promise<HQConnectionMessage>(resolve => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString()) as HQConnectionMessage
        if (msg.type === 'channel.error') resolve(msg)
      })
    })

    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.request',
      siteId: 's1',
      requestId: 'a1',
      payload: { method: 'hq.anything', params: {} },
    }))

    const msg = await reply
    expect(msg.replyTo).toBe('a1')
    expect(msg.payload).toMatchObject({ code: 'unknown_method', message: 'hq exposes no channel methods' })
    ws.close()
  })
})

describe('reconnect hook @SC-340', () => {
  it('fires onSiteConnected with the siteId after the registry has recorded the connection', async () => {
    const onSiteConnected = vi.fn()
    // A second server sharing this test's port pattern would collide, so this
    // spins up its own — the outer beforeEach's `server`/`registry` already
    // wired a plain onSiteEvent-only deps object.
    const server2 = http.createServer((_req, res) => res.end('ok'))
    const registry2 = new SiteChannelRegistry(noopStore)
    const sockets2 = new Set<import('node:net').Socket>()
    server2.on('connection', s => { sockets2.add(s); s.on('close', () => sockets2.delete(s)) })
    attachSiteChannel(server2, {
      registry: registry2,
      authenticate: async (siteId, credential) => (credential === 'good' ? { siteId } : null),
      siteExists: async () => true,
      onSiteEvent: vi.fn().mockResolvedValue(undefined),
      onSiteConnected,
      recordProtocolVersion: async () => {},
      markVersionMismatch: async () => {},
    })
    await new Promise<void>(resolve => server2.listen(0, resolve))
    const port2 = (server2.address() as { port: number }).port

    const ws = new WebSocket(`ws://127.0.0.1:${port2}${HQ_SITE_CHANNEL_PATH}`, { headers: goodHeaders })
    await opened(ws)

    expect(onSiteConnected).toHaveBeenCalledWith('s1')
    expect(registry2.isOnline('s1')).toBe(true)

    ws.close()
    for (const s of sockets2) s.destroy()
    await new Promise<void>(resolve => server2.close(() => resolve()))
  })

  it('omitting onSiteConnected is harmless — a connection still succeeds', async () => {
    // The outer beforeEach's `attachSiteChannel` call omits onSiteConnected
    // entirely — reaching a normal open proves the optional call is safe.
    const ws = dial(goodHeaders)
    await opened(ws)
    expect(registry.isOnline('s1')).toBe(true)
    ws.close()
  })
})

describe('site.event intake @SC-343', () => {
  it('routes a site.event frame to the handler dep with (siteId, event, data)', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)

    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: 's1',
      payload: { event: 'run.status', data: { runId: 'r1' } },
    }))

    await vi.waitFor(() => expect(onSiteEvent).toHaveBeenCalledWith('s1', 'run.status', { runId: 'r1' }))
    ws.close()
  })

  it('drops a malformed frame (payload without a string event) without closing the socket', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)

    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: 's1',
      payload: { data: { runId: 'r1' } },
    }))

    // Follow it with a real frame on the same socket — if the malformed one
    // had closed the connection, this would never arrive.
    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: 's1',
      payload: { event: 'run.status', data: {} },
    }))

    await vi.waitFor(() => expect(onSiteEvent).toHaveBeenCalledTimes(1))
    expect(onSiteEvent).toHaveBeenCalledWith('s1', 'run.status', {})
    expect(ws.readyState).toBe(ws.OPEN)
    ws.close()
  })

  // A site a minor ahead may send a message type this hq does not know: it is ignored, never refused.
  it('drops a message type it does not know without effect and keeps the socket', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)

    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.identity_update',
      siteId: 's1',
      payload: { name: 'Renamed by the site', description: 'x' },
    }))
    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: 's1',
      payload: { event: 'run.status', data: {} },
    }))

    await vi.waitFor(() => expect(onSiteEvent).toHaveBeenCalledTimes(1))
    expect(ws.readyState).toBe(ws.OPEN)
    ws.close()
  })

  it('still refuses a channel.request from the site — existing behaviour untouched', async () => {
    const ws = dial(goodHeaders)
    await opened(ws)

    const reply = new Promise<HQConnectionMessage>(resolve => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString()) as HQConnectionMessage
        if (msg.type === 'channel.error') resolve(msg)
      })
    })

    ws.send(JSON.stringify({
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.request',
      siteId: 's1',
      requestId: 'a2',
      payload: { method: 'hq.anything', params: {} },
    }))

    const msg = await reply
    expect(msg.replyTo).toBe('a2')
    expect(msg.payload).toMatchObject({ code: 'unknown_method', message: 'hq exposes no channel methods' })
    expect(onSiteEvent).not.toHaveBeenCalled()
    ws.close()
  })
})
