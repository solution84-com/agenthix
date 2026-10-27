import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import { RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER } from '@agenthix/core'
import { attachRelayLink, type RelayLinks } from '../relayLinkServer'
import type { RelayLoad } from '../relayReport'

vi.mock('../../server/utils/logger', () => ({ Logger: class { info() {} warn() {} error() {} } }))

const SECRET = 'r'.repeat(48)
let server: http.Server
let port: number
let links: RelayLinks
let seen: string[]
let reports: Array<{ relayId: string; load: RelayLoad }>
const clients: WebSocket[] = []

beforeEach(async () => {
  seen = []
  reports = []
  server = http.createServer((_q, r) => r.end())
  links = attachRelayLink(server, {
    authenticate: async secret => (secret === SECRET ? { relayId: 'relay-hq' } : null),
    recordSeen: async relayId => { seen.push(relayId) },
    recordReport: async (relayId, load) => { reports.push({ relayId, load }) },
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate()
  server.closeAllConnections()
  await new Promise<void>(r => server.close(() => r()))
})

function dial(headers: Record<string, string>, path = RELAY_HQ_LINK_PATH): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers })
  clients.push(ws)
  return ws
}
const good = () => ({ Authorization: `Bearer ${SECRET}`, [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION })

function refusal(ws: WebSocket): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    ws.on('unexpected-response', (_req, res) => resolve({ status: res.statusCode ?? 0, headers: res.headers }))
    ws.on('open', () => reject(new Error('the link was accepted')))
    ws.on('error', () => {})
  })
}
function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise(resolve => ws.once('message', d => resolve(JSON.parse(d.toString()))))
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise(r => setTimeout(r, 10))
}

describe("a relay's link to hq @SC-1526", () => {
  it('refuses a missing or wrong secret with 401, whatever version it states', async () => {
    expect((await refusal(dial({ [RELAY_PROTOCOL_VERSION_HEADER]: RELAY_PROTOCOL_VERSION }))).status).toBe(401)
    const wrong = await refusal(dial({ Authorization: `Bearer ${'x'.repeat(48)}`, [RELAY_PROTOCOL_VERSION_HEADER]: '9.0' }))
    expect(wrong.status).toBe(401)
    expect(wrong.headers[RELAY_PROTOCOL_VERSION_HEADER.toLowerCase()]).toBeUndefined()
    expect(seen).toEqual([])
  })

  it('refuses an authenticated relay two majors apart, or stating no version, with 426 and its own version', async () => {
    for (const version of ['3.0', '']) {
      const r = await refusal(dial({ Authorization: `Bearer ${SECRET}`, [RELAY_PROTOCOL_VERSION_HEADER]: version }))
      expect(r.status).toBe(426)
      expect(r.headers[RELAY_PROTOCOL_VERSION_HEADER.toLowerCase()]).toBe(RELAY_PROTOCOL_VERSION)
    }
    expect(links.isConnected('relay-hq')).toBe(false)
  })

  it('welcomes an accepted relay with its id, and records it as seen', async () => {
    const ws = dial(good())
    expect(await nextMessage(ws)).toEqual({ type: 'relay.welcome', version: RELAY_PROTOCOL_VERSION, relayId: 'relay-hq' })
    await until(() => seen.length > 0)
    expect(seen).toEqual(['relay-hq'])
    expect(links.isConnected('relay-hq')).toBe(true)
  })

  it("records each report, and drops a frame that is not one", async () => {
    const ws = dial(good())
    await nextMessage(ws)
    ws.send('not a report')
    ws.send(Buffer.from([1, 2, 3]))
    ws.send(JSON.stringify({ type: 'relay.report', version: '1.0', startedAt: '2026-10-26T10:00:00.000Z', sites: ['s1'], openStreams: 1, bytesCarried: 9 }))
    await until(() => reports.length > 0)
    expect(reports).toEqual([{ relayId: 'relay-hq', load: { startedAt: '2026-10-26T10:00:00.000Z', sites: ['s1'], openStreams: 1, bytesCarried: 9 } }])
  })

  it('keeps one link per relay: dialling again replaces the old one', async () => {
    const first = dial(good())
    await nextMessage(first)
    const closed = new Promise<number>(r => first.on('close', code => r(code)))
    const second = dial(good())
    await nextMessage(second)
    expect(await closed).toBe(4000)
    await new Promise(r => setTimeout(r, 20))
    expect(links.isConnected('relay-hq')).toBe(true)
    second.close()
    await until(() => !links.isConnected('relay-hq'))
    expect(links.isConnected('relay-hq')).toBe(false)
  })

  it('leaves other paths alone', async () => {
    let other = false
    server.on('upgrade', (req, socket) => { if (req.url === '/elsewhere') { other = true; socket.destroy() } })
    const ws = dial(good(), '/elsewhere')
    ws.on('error', () => {})
    await until(() => other)
    expect(other).toBe(true)
    expect(links.isConnected('relay-hq')).toBe(false)
  })
})
