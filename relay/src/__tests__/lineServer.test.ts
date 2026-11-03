import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, SITE_PROTOCOL_VERSION_HEADER } from '@agenthix/core'
import { MIN_REFETCH_MS } from '../keySet'
import { FakeSite, dialStatus } from '../test/fakeSite'
import { startRelay, until, type Harness } from '../test/harness'
import { makeSigner, passClaims } from '../test/signer'

let relay: Harness
afterEach(async () => relay?.close())

describe('a site dials its relay with a pass @SC-1472 @SC-1562 @SC-1565', () => {
  it('keeps the line of a site whose pass hq signed for this relay', async () => {
    relay = await startRelay()
    const site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, () => ({}))
    await until(() => relay.lines.current('site-1') !== null)
    expect(relay.lines.sites()).toEqual(['site-1'])
    await site.close()
    await until(() => relay.lines.current('site-1') === null)
  })

  it('takes no line before hq has named the relay', async () => {
    relay = await startRelay()
    relay.setRelayId(null)
    expect((await dialStatus({ port: relay.port, pass: relay.signer.sign(passClaims()) })).status).toBe(503)
  })

  it('refuses a dial with no pass or no site id', async () => {
    relay = await startRelay()
    expect((await dialStatus({ port: relay.port, pass: '' })).status).toBe(401)
    expect((await dialStatus({ port: relay.port, pass: relay.signer.sign(passClaims()), siteId: '' })).status).toBe(401)
  })

  it.each([
    ['signed by another key', () => makeSigner(relay.signer.kid).sign(passClaims())],
    ['for another relay', () => relay.signer.sign(passClaims({ aud: 'relay-2' }))],
    ['given to another site', () => relay.signer.sign(passClaims({ sub: 'site-2' }))],
    ['expired', () => relay.signer.sign(passClaims({ iat: 1_000, exp: 2_000 }))],
    ['a ticket, not a pass', () => relay.signer.sign(passClaims({ tokenType: 'file-ticket' }))],
    ['not a token', () => 'not-a-token'],
  ])('refuses a pass %s', async (_name, make) => {
    relay = await startRelay()
    expect((await dialStatus({ port: relay.port, pass: make() })).status).toBe(401)
    expect(relay.lines.sites()).toEqual([])
  })

  it('refetches hq\'s key set once for a key it does not hold, and no more than once a while', async () => {
    const old = makeSigner('hq-key-1')
    const rotated = makeSigner('hq-key-2')
    let served = old.keys
    let t = 1_000_000
    relay = await startRelay({}, rotated, () => served, () => t)
    await relay.keys.current()
    served = rotated.keys
    t += MIN_REFETCH_MS
    expect((await dialStatus({ port: relay.port, pass: rotated.sign(passClaims()) })).status).toBe(101)
    expect(relay.fetches).toBe(2)
    expect((await dialStatus({ port: relay.port, pass: makeSigner('made-up').sign(passClaims()) })).status).toBe(401)
    expect(relay.fetches).toBe(2)
  })

  it('refuses after the version check only once the pass is good, with 426 and its own versions', async () => {
    relay = await startRelay()
    const pass = relay.signer.sign(passClaims())
    const old = await dialStatus({ port: relay.port, pass, headers: { [SITE_PROTOCOL_VERSION_HEADER]: '1.7' } })
    expect(old.status).toBe(426)
    expect(old.headers[RELAY_PROTOCOL_VERSION_HEADER.toLowerCase()]).toBe(RELAY_PROTOCOL_VERSION)
    expect((await dialStatus({ port: relay.port, pass, headers: { [RELAY_PROTOCOL_VERSION_HEADER]: '3.0' } })).status).toBe(426)
    expect((await dialStatus({ port: relay.port, pass: 'x', headers: { [RELAY_PROTOCOL_VERSION_HEADER]: '3.0' } })).status).toBe(401)
  })

  it('refuses an upgrade on any other path', async () => {
    relay = await startRelay()
    const status = await new Promise<number>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/somewhere`)
      ws.on('unexpected-response', (_r, res) => resolve(res.statusCode ?? 0))
      ws.on('error', () => {})
    })
    expect(status).toBe(404)
  })

  it('keeps one line per site: a new dial takes new streams, the old line closes', async () => {
    relay = await startRelay()
    const pass = relay.signer.sign(passClaims())
    const first = await FakeSite.connect({ port: relay.port, pass }, () => ({}))
    await until(() => relay.lines.current('site-1') !== null)
    const firstMux = relay.lines.current('site-1')
    const closed = new Promise<number>(resolve => first.ws.once('close', code => resolve(code)))
    const second = await FakeSite.connect({ port: relay.port, pass }, () => ({}))
    await until(() => relay.lines.current('site-1') !== firstMux)
    expect(await closed).toBe(4000)
    expect(relay.lines.sites()).toEqual(['site-1'])
    await second.close()
  })
})
