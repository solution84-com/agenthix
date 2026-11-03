/** The hq link's part in live apps (relay protocol 1.1): asking hq, taking its revocations, reporting refusals. */
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, type RelayRevoke } from '@agenthix/core'
import { AppRefusals } from '../apps/appRefusals'
import { HqLink } from '../hq/hqLink'
import { readRevoke } from '../hq/revokeFrame'
import { Load } from '../load'
import { SiteLines } from '../lines/siteLines'
import { until } from '../test/harness'

const SECRET = 's'.repeat(40)
const V = RELAY_PROTOCOL_VERSION
let hq: WebSocketServer
let link: HqLink | null = null
afterEach(async () => {
  link?.stop()
  link = null
  await new Promise(resolve => hq.close(resolve))
})

async function fakeHq(onFrame: (ws: WebSocket, frame: Record<string, unknown>) => void, onOpen: (ws: WebSocket) => void = () => {}) {
  hq = new WebSocketServer({ port: 0, host: '127.0.0.1', path: RELAY_HQ_LINK_PATH })
  hq.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'relay.welcome', version: V, relayId: 'relay-1' }))
    ws.on('message', d => onFrame(ws, JSON.parse(d.toString())))
    onOpen(ws)
  })
  await new Promise(resolve => hq.once('listening', resolve))
  return `http://127.0.0.1:${(hq.address() as AddressInfo).port}`
}

const q = { ticketId: 't1', person: 'p1', appId: 'a1', livePreviewId: 'r1' }

describe('the hq link for live apps @SC-1752', () => {
  it('asks hq whether a ticket stands, and takes its answer', async () => {
    const asked: Record<string, unknown>[] = []
    const address = await fakeHq((ws, f) => {
      if (f.type !== 'relay.ask') return
      asked.push(f)
      ws.send(JSON.stringify({ type: 'relay.answer', version: V, askId: f.askId, stands: f.ticketId === 't1' }))
    })
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), log: () => {} })
    link.start()
    await until(() => link!.connected)
    expect(await link.ask(q)).toBe(true)
    expect(await link.ask({ ...q, ticketId: 't2' })).toBe(false)
    expect(asked[0]).toMatchObject({ type: 'relay.ask', version: V, ...q, askId: expect.any(String) })
  })

  it('takes silence, or no link, as no', async () => {
    const address = await fakeHq(() => {})
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), log: () => {}, askTimeoutMs: 50 })
    expect(await link.ask(q)).toBe(false)
    link.start()
    await until(() => link!.connected)
    expect(await link.ask(q)).toBe(false)
  })

  it('passes on a revocation it can read, and drops one it cannot', async () => {
    const revoked: RelayRevoke[] = []
    const logs: string[] = []
    const address = await fakeHq(() => {}, ws => {
      ws.send(JSON.stringify({ type: 'relay.revoke', version: V, person: 7 }))
      ws.send(JSON.stringify({ type: 'relay.revoke', version: V, person: 'p1' }))
    })
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), log: l => logs.push(l), onRevoke: f => revoked.push(f) })
    link.start()
    await until(() => revoked.length === 1)
    expect(revoked[0]).toMatchObject({ person: 'p1' })
    expect(logs.some(l => /revocation/.test(l))).toBe(true)
  })

  it('reports the refusals for each app since the last report, and apps\' streams with files\'', async () => {
    const reports: Record<string, unknown>[] = []
    const address = await fakeHq((_ws, f) => { if (f.type === 'relay.report') reports.push(f) })
    const refusals = new AppRefusals()
    refusals.count('a1', 'cross-site')
    refusals.count('a1', 'cross-site')
    const appLoad = new Load()
    appLoad.take('p1')
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), appLoad, refusals, log: () => {}, reportIntervalMs: 20 })
    link.start()
    await until(() => reports.length >= 2)
    expect(reports[0]).toMatchObject({ openStreams: 1, appRefusals: [{ appId: 'a1', refusal: 'cross-site', count: 2 }] })
    expect(reports[1].appRefusals).toBeUndefined()
  })
})

describe('reading a revocation @SC-1752', () => {
  it('reads each kind, and refuses what is malformed or cuts off nothing', () => {
    expect(readRevoke({ type: 'relay.revoke', version: V, apps: ['a'], livePreviews: ['r'], tickets: ['t'] })).toMatchObject({ apps: ['a'], livePreviews: ['r'], tickets: ['t'] })
    expect(readRevoke({ type: 'relay.revoke', version: V, person: 'p' })).toMatchObject({ person: 'p' })
    expect(readRevoke({ type: 'relay.revoke', version: V })).toBeNull()
    expect(readRevoke({ type: 'relay.revoke', version: V, apps: [1] })).toBeNull()
    expect(readRevoke({ type: 'relay.revoke', version: V, person: '' })).toBeNull()
    expect(readRevoke({ type: 'relay.revoke', version: V, livePreviews: 'r' })).toBeNull()
    expect(readRevoke({ type: 'relay.revoke', version: '9.0', apps: ['a'] })).toBeNull()
  })
})
