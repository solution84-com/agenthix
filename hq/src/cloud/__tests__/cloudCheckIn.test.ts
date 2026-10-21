/**
 * A connected hq checks in with Cloud at least hourly: it signs for an access token whenever an hour would otherwise
 * pass without one, which Cloud reads as hq being alive, and so learns within the hour that Cloud ended it.
 */
import { describe, expect, it } from 'vitest'
import { CHECK_IN_MS } from '../cloudConnection'
import { harness } from './connectionHarness'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

async function connected(options: Parameters<typeof harness>[0] = { tokenLifetime: 3600 }) {
  const h = harness(options)
  const { userCode } = await h.connection.connect('u-sam')
  h.cloud.approve(userCode)
  await h.advance(5_000)
  const tokenRequests = () => h.cloud.requests.filter(r => r.path === '/connect/token' && r.form.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code').length
  return { ...h, tokenRequests }
}

describe('checking in with Cloud', () => {
  it('a quiet hq signs for a token within every hour while connected', async () => {
    const h = await connected()
    expect(h.tokenRequests()).toBe(0)
    await h.advance(HOUR)
    expect(h.tokenRequests()).toBe(1)
    await h.advance(3 * HOUR)
    expect(h.tokenRequests()).toBe(4)
  })

  it('a token signed for anyway counts, so a busy hq adds no call', async () => {
    const h = await connected({ tokenLifetime: 300 })
    for (let i = 0; i < 12; i++) {
      await h.advance(5 * MINUTE)
      await h.connection.accessToken()
    }
    const used = h.tokenRequests()
    expect(used).toBe(12)
    await h.advance(30 * MINUTE)
    expect(h.tokenRequests()).toBe(used)
  })

  it('Cloud ending the connection from its side is learned at the next check-in', async () => {
    const h = await connected()
    h.cloud.revokeFromCloud(h.stored()!.clientId)
    await h.advance(HOUR)
    expect(h.stored()).toBeNull()
    expect(h.keys()).toBeNull()
    expect(h.events).toContain('disconnected Acme Robotics by null')
    const asked = h.cloud.requests.length
    await h.advance(3 * HOUR)
    expect(h.cloud.requests).toHaveLength(asked)
  })

  it('stops when an admin disconnects', async () => {
    const h = await connected()
    await h.connection.disconnect('u-sam')
    const asked = h.cloud.requests.length
    await h.advance(3 * HOUR)
    expect(h.cloud.requests).toHaveLength(asked)
  })

  it('Cloud away at a check-in: it tries again in a few minutes, and the connection stays', async () => {
    const h = await connected()
    await h.advance(CHECK_IN_MS - MINUTE)
    h.cloud.answerNextWith('network')
    await h.advance(MINUTE)
    expect(h.tokenRequests()).toBe(1)
    await h.advance(5 * MINUTE)
    expect(h.tokenRequests()).toBe(2)
    expect(h.stored()).not.toBeNull()
  })

  it('Cloud busy at a check-in: it waits as long as Cloud says', async () => {
    const h = await connected()
    await h.advance(CHECK_IN_MS - MINUTE)
    h.cloud.answerNextWith({ status: 429, body: {}, headers: { 'retry-after': '1200' } })
    await h.advance(MINUTE)
    await h.advance(19 * MINUTE)
    expect(h.tokenRequests()).toBe(1)
    await h.advance(MINUTE)
    expect(h.tokenRequests()).toBe(2)
  })

  it('at start-up, a stored connection checks in at once; with none, Cloud is not called', async () => {
    const h = await connected()
    await h.connection.startCheckIns()
    expect(h.tokenRequests()).toBe(1)
    await h.connection.disconnect('u-sam')
    const asked = h.cloud.requests.length
    await h.connection.startCheckIns()
    await h.advance(2 * HOUR)
    expect(h.cloud.requests).toHaveLength(asked)
  })

  it("tells Cloud hq's address when it is not the one registered, and once only @SC-1144", async () => {
    const h = await connected()
    const told = () => h.cloud.requests.filter(r => r.path === '/connect/address')
    await h.connection.startCheckIns()
    expect(told()).toHaveLength(0)
    h.setAddress('https://HQ.new.example/')
    await h.connection.startCheckIns()
    expect(told().map(r => r.form.hq_address)).toEqual(['https://hq.new.example'])
    expect(h.cloud.clients.get(h.stored()!.clientId)?.hqAddress).toBe('https://hq.new.example')
    await h.advance(2 * HOUR)
    expect(told()).toHaveLength(1)
  })

  it('Cloud away when hq tells it its address: it tells it again at the next check-in @SC-1144', async () => {
    const h = await connected()
    h.setAddress('https://hq.new.example')
    h.cloud.answerNextWith('network', '/connect/address')
    await h.connection.startCheckIns()
    expect(h.cloud.clients.get(h.stored()!.clientId)?.hqAddress).toBe('https://hq.acme.example')
    await h.advance(5 * MINUTE)
    expect(h.cloud.clients.get(h.stored()!.clientId)?.hqAddress).toBe('https://hq.new.example')
  })
})
