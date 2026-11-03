/** The relay link's part in live apps (relay protocol 1.1): hq answers asks, reads refusal counts, pushes revocations. */
import { withFeature } from '@agenthix/core/testing'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import { RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER } from '@agenthix/core'
import { attachRelayLink, type RelayLinks } from '../relayLinkServer'
import type { AppRefusalCounts } from '../relayReport'

vi.mock('../../server/utils/logger', () => ({ Logger: class { info() {} warn() {} error() {} } }))

const SECRET = 'r'.repeat(48)
const V = RELAY_PROTOCOL_VERSION
let server: http.Server
let links: RelayLinks
let port: number
let asks: unknown[]
let refusals: AppRefusalCounts[]
const clients: WebSocket[] = []

beforeEach(async () => {
  asks = []
  refusals = []
  server = http.createServer((_q, r) => r.end())
  links = attachRelayLink(server, {
    authenticate: async secret => (secret === SECRET ? { relayId: 'relay-hq' } : null),
    recordSeen: async () => {},
    recordReport: async () => {},
    answerAsk: async (_relayId, ask) => { asks.push(ask); return ask.ticketId === 'good' },
    onAppRefusals: (_relayId, counts) => { refusals.push(counts) },
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate()
  server.closeAllConnections()
  await new Promise<void>(r => server.close(() => r()))
})

async function relay(): Promise<{ ws: WebSocket; frames: Record<string, unknown>[] }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${RELAY_HQ_LINK_PATH}`, { headers: { Authorization: `Bearer ${SECRET}`, [RELAY_PROTOCOL_VERSION_HEADER]: V } })
  clients.push(ws)
  const frames: Record<string, unknown>[] = []
  ws.on('message', d => frames.push(JSON.parse(d.toString())))
  await new Promise(r => ws.once('open', r))
  await vi.waitFor(() => expect(frames[0]?.type).toBe('relay.welcome'))
  return { ws, frames }
}

const ask = (askId: string, ticketId: unknown) => JSON.stringify({ type: 'relay.ask', version: V, askId, ticketId, person: 'mia', appId: 'a', livePreviewId: 'r1' })

withFeature('livePreview', () => {
describe('hq on the relay link, for live apps @SC-1706', () => {
  it('answers each ask with hq\'s word, and no for an ask it cannot read', async () => {
    const { ws, frames } = await relay()
    ws.send(ask('a1', 'good'))
    ws.send(ask('a2', 'bad'))
    ws.send(ask('a3', 42))
    await vi.waitFor(() => expect(frames.filter(f => f.type === 'relay.answer')).toHaveLength(3))
    const answers = Object.fromEntries(frames.filter(f => f.type === 'relay.answer').map(f => [f.askId, f.stands]))
    expect(answers).toEqual({ a1: true, a2: false, a3: false })
    expect(asks).toEqual([
      { askId: 'a1', ticketId: 'good', person: 'mia', appId: 'a', livePreviewId: 'r1' },
      { askId: 'a2', ticketId: 'bad', person: 'mia', appId: 'a', livePreviewId: 'r1' },
    ])
  })

  it('reads the refusals a report counts, dropping what it cannot read', async () => {
    const { ws } = await relay()
    ws.send(JSON.stringify({
      type: 'relay.report', version: V, startedAt: new Date().toISOString(), sites: [], openStreams: 0, bytesCarried: 0,
      appRefusals: [{ appId: 'a', refusal: 'cross-site', count: 3 }, { appId: 'a', refusal: 'made-up', count: 1 }],
    }))
    await vi.waitFor(() => expect(refusals).toEqual([[{ appId: 'a', refusal: 'cross-site', count: 3 }]]))
  })

  it('pushes a revocation to every relay connected', async () => {
    const { frames } = await relay()
    links.broadcast({ type: 'relay.revoke', version: V, livePreviews: ['r1'] })
    await vi.waitFor(() => expect(frames).toContainEqual({ type: 'relay.revoke', version: V, livePreviews: ['r1'] }))
  })
})
})
