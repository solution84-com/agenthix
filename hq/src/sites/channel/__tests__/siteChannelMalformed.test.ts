/**
 * No frame a connected site sends can stop hq: every frame's shape is read before it is used, the socket listens for
 * 'error' from the moment it opens, and a handler that fails is caught. A real http server, ws server and client.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type net from 'node:net'
import WebSocket from 'ws'
import { SITE_PROTOCOL_VERSION, HQ_SITE_CHANNEL_PATH, type HQConnectionMessage } from '@agenthix/core'
import { attachSiteChannel } from '../siteChannelServer'
import { SiteChannelRegistry } from '../siteChannelRegistry'
import type { SiteStatusStore } from '../siteStatusStore'

let server: http.Server
let registry: SiteChannelRegistry
let port: number
let sockets: Set<net.Socket>
let store: SiteStatusStore

beforeEach(async () => {
  store = {
    markOnline: async () => {}, markOffline: async () => {}, touch: async () => {},
    recordProtocolVersion: async () => {}, markVersionMismatch: async () => {},
  }
  // Each call goes through `store` as it is when called, so a test may swap one method.
  registry = new SiteChannelRegistry({
    markOnline: id => store.markOnline(id), markOffline: id => store.markOffline(id), touch: id => store.touch(id),
    recordProtocolVersion: (id, v) => store.recordProtocolVersion(id, v),
    markVersionMismatch: (id, v, at) => store.markVersionMismatch(id, v, at),
  })
  server = http.createServer((_req, res) => res.end('ok'))
  sockets = new Set()
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  attachSiteChannel(server, {
    registry,
    authenticate: async (siteId, credential) => (credential === 'good' ? { siteId } : null),
    siteExists: async () => true,
    onSiteEvent: async () => {},
    recordProtocolVersion: async () => {},
    markVersionMismatch: async () => {},
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const s of sockets) s.destroy()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

function dial(): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${HQ_SITE_CHANNEL_PATH}`, {
    headers: { Authorization: 'Bearer good', 'X-Site-Id': 's1', 'X-Site-Protocol-Version': SITE_PROTOCOL_VERSION },
  })
  ws.on('error', () => {})
  return ws
}

const opened = (ws: WebSocket) => new Promise<void>((resolve, reject) => {
  ws.once('open', () => resolve())
  ws.once('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)))
})
const closed = (ws: WebSocket) => new Promise<void>(resolve => ws.once('close', () => resolve()))
const frame = (msg: Partial<HQConnectionMessage> & Record<string, unknown>) =>
  JSON.stringify({ version: SITE_PROTOCOL_VERSION, siteId: 's1', payload: {}, ...msg })

/** hq still reads this connection: it answers a request the site makes with its refusal. */
async function stillAnswers(ws: WebSocket): Promise<void> {
  const reply = new Promise<HQConnectionMessage>(resolve => ws.on('message', raw => {
    const msg = JSON.parse(raw.toString()) as HQConnectionMessage
    if (msg.type === 'channel.error' && msg.replyTo === 'probe') resolve(msg)
  }))
  ws.send(frame({ type: 'channel.request', requestId: 'probe', payload: { method: 'x', params: {} } }))
  expect((await reply).payload).toMatchObject({ code: 'unknown_method' })
}

describe('a malformed frame from a connected site @SC-291', () => {
  it('is dropped, and the connection goes on', async () => {
    const ws = dial()
    await opened(ws)
    for (const text of ['null', '7', '"x"', '[]', 'true', '{}', '{"version":1}', '{"version":{"trim":1}}',
      JSON.stringify({ version: null, type: 'pong', siteId: 's1' }), frame({ type: 7 as never }), frame({ siteId: ['s1'] as never }),
      frame({ type: 'channel.request', requestId: {} as never }), frame({ type: 'channel.error', replyTo: 5 as never })]) {
      ws.send(text)
    }
    await stillAnswers(ws)
    ws.close()
  })

  it('fails the request it answers when it is a channel.error with no payload or one hq cannot read', async () => {
    const ws = dial()
    await opened(ws)
    const payloads = [undefined, null, 'boom', { message: 1, code: 'x' }]
    let asked = 0
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as HQConnectionMessage
      if (msg.type !== 'channel.request') return
      const payload = payloads[asked++]
      ws.send(JSON.stringify({ version: SITE_PROTOCOL_VERSION, type: 'channel.error', siteId: 's1', replyTo: msg.requestId, payload }))
    })
    for (let i = 0; i < payloads.length; i++) {
      await expect(registry.request('s1', 'site.describe', {}, 2000)).rejects.toMatchObject({ code: 'handler_failed' })
    }
    await stillAnswers(ws)
    ws.close()
  })

  it('does not stop hq when recording a pong fails', async () => {
    store.touch = async () => { throw new Error('database gone') }
    const ws = dial()
    await opened(ws)
    ws.send(frame({ type: 'pong' }))
    await stillAnswers(ws)
    ws.close()
  })
})

describe('a socket fault on a site connection @SC-291', () => {
  it('closes the connection, even while hq is still recording it, and hq goes on', async () => {
    let recorded!: () => void
    store.markOnline = () => new Promise<void>(resolve => { recorded = resolve })
    const ws = dial()
    await opened(ws)
    // Not UTF-8, in a text frame: ws reports an error on hq's side of the socket.
    ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false })
    await closed(ws)
    recorded()
    await expect.poll(() => registry.isOnline('s1')).toBe(false)
  })

  it('closes a connection hq could not record, and hq goes on', async () => {
    store.markOnline = async () => { throw new Error('database gone') }
    const ws = dial()
    await opened(ws)
    await closed(ws)
    store.markOnline = async () => {}
    const next = dial()
    await opened(next)
    await stillAnswers(next)
    next.close()
  })
})
