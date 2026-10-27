import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, type RelayLinkReport } from '@agenthix/core'
import { HqLink, relayLinkUrl } from '../hq/hqLink'
import { Load } from '../load'
import { SiteLines } from '../lines/siteLines'
import { until } from '../test/harness'

const SECRET = 's'.repeat(40)
let hq: WebSocketServer
let link: HqLink | null = null
afterEach(async () => {
  link?.stop()
  link = null
  await new Promise(resolve => hq.close(resolve))
})

async function fakeHq(onConnection: (ws: WebSocket, headers: Record<string, unknown>) => void, verify?: (h: Record<string, unknown>) => boolean) {
  hq = new WebSocketServer({
    port: 0, host: '127.0.0.1', path: RELAY_HQ_LINK_PATH,
    verifyClient: verify ? (info, cb) => cb(verify(info.req.headers), 401) : undefined,
  })
  hq.on('connection', (ws, req) => onConnection(ws, req.headers))
  await new Promise(resolve => hq.once('listening', resolve))
  return `http://127.0.0.1:${(hq.address() as AddressInfo).port}`
}

describe('the hq link @SC-1471', () => {
  it('dials hq with the secret and its protocol version, learns its id and reports its load', async () => {
    const reports: RelayLinkReport[] = []
    let seen: Record<string, unknown> = {}
    const address = await fakeHq((ws, headers) => {
      seen = headers
      ws.send(JSON.stringify({ type: 'relay.welcome', version: RELAY_PROTOCOL_VERSION, relayId: 'relay-7' }))
      ws.on('message', d => reports.push(JSON.parse(d.toString())))
    })
    const lines = new SiteLines()
    link = new HqLink({ hqAddress: address, secret: SECRET, lines, load: new Load(), log: () => {}, reportIntervalMs: 20 })
    link.start()
    await until(() => link!.relayId === 'relay-7' && reports.length >= 2)
    expect(seen.authorization).toBe(`Bearer ${SECRET}`)
    expect(seen['x-relay-protocol-version']).toBe(RELAY_PROTOCOL_VERSION)
    expect(reports[0]).toMatchObject({ type: 'relay.report', version: '1.0', sites: [], openStreams: 0, bytesCarried: 0 })
  })

  it('ignores a welcome it cannot read or of a protocol too far apart', async () => {
    const address = await fakeHq(ws => {
      ws.send('not json')
      ws.send(JSON.stringify({ type: 'relay.welcome', version: '3.0', relayId: 'relay-x' }))
      ws.send(JSON.stringify({ type: 'relay.welcome', version: '1.0', relayId: '../bad id' }))
      ws.send(JSON.stringify({ type: 'relay.welcome', version: '1.0', relayId: 'relay-ok' }))
    })
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), log: () => {} })
    link.start()
    await until(() => link!.relayId !== null)
    expect(link.relayId).toBe('relay-ok')
  })

  it('reconnects after hq drops it, and says plainly when hq refuses its secret', async () => {
    let connections = 0
    let refuse = true
    const logs: string[] = []
    const address = await fakeHq(ws => {
      connections++
      if (connections === 1) ws.close()
    }, () => {
      if (refuse) {
        refuse = false
        return false
      }
      return true
    })
    link = new HqLink({ hqAddress: address, secret: SECRET, lines: new SiteLines(), load: new Load(), log: l => logs.push(l), firstReconnectMs: 10 })
    link.start()
    await until(() => connections >= 2, 4000)
    expect(logs.some(l => /HQ_RELAY_SECRET/.test(l))).toBe(true)
    expect(logs.join('\n')).not.toContain(SECRET)
  })

  it('closes every site\'s line when hq names the relay anew, since their passes name the old id', async () => {
    let send: ((id: string) => void) | null = null
    const address = await fakeHq(ws => {
      send = id => ws.send(JSON.stringify({ type: 'relay.welcome', version: '1.0', relayId: id }))
      send('relay-1')
    })
    const lines = new SiteLines()
    let closed: number | null = null
    lines.add('site-1', { readyState: 1, OPEN: 1, send: () => {}, close: code => { closed = code ?? 0 } })
    link = new HqLink({ hqAddress: address, secret: SECRET, lines, load: new Load(), log: () => {} })
    link.start()
    await until(() => link!.relayId === 'relay-1')
    expect(closed).toBeNull()
    send!('relay-2')
    await until(() => link!.relayId === 'relay-2')
    expect(closed).toBe(4003)
    expect(lines.sites()).toEqual([])
  })

  it('makes the link address from hq\'s', () => {
    expect(relayLinkUrl('https://hq.example.com/x?y')).toBe('wss://hq.example.com/relay-link')
    expect(relayLinkUrl('http://hq-server:4101')).toBe('ws://hq-server:4101/relay-link')
  })
})
