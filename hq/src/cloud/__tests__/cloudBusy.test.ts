/**
 * Cloud's "too many requests" (`429`): hq waits as long as `Retry-After` says before it calls Cloud again, and an
 * admin asking to connect is told when to try again.
 */
import { describe, expect, it } from 'vitest'
import { CloudBusyError, cloudClient } from '../cloudClient'
import { harness } from './connectionHarness'

const START = Date.UTC(2026, 0, 1)
const busy = (headers: Record<string, string> = {}) => ({ status: 429, body: { error: 'too_many_requests' }, headers })

describe("Cloud's 429", () => {
  it('a connection request answered 429 tells the admin when to try again, and asks Cloud nothing before then', async () => {
    const h = harness()
    h.cloud.answerNextWith(busy({ 'retry-after': '180' }))
    const refused = await h.connection.connect('u-sam').catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(CloudBusyError)
    expect((refused as Error).message).toBe('Agenthix Cloud is busy — try again in 3 minutes.')
    await h.advance(120_000)
    await expect(h.connection.connect('u-sam')).rejects.toThrow('try again in 1 minute.')
    expect(h.cloud.requests).toHaveLength(1)
    await h.advance(60_000)
    await h.connection.connect('u-sam')
    expect(h.cloud.requests.map(r => r.path)).toEqual(['/connect/device', '/connect/device'])
  })

  it('reads Retry-After as an HTTP date, and waits a minute when it is missing or unreadable', async () => {
    let now = START
    const h = harness()
    const client = cloudClient(h.cloud.base, h.cloud.fetch, () => now)
    const waitOf = async (headers: Record<string, string>) => {
      h.cloud.answerNextWith(busy(headers))
      const err = await client.requestConnection('k', 'https://hq.acme.example', 'Acme').catch((e: unknown) => e) as CloudBusyError
      const wait = err.retryAt - now
      now = err.retryAt
      return wait
    }
    expect(await waitOf({ 'retry-after': new Date(START + 300_000).toUTCString() })).toBe(300_000)
    expect(await waitOf({})).toBe(60_000)
    expect(await waitOf({ 'retry-after': 'soon' })).toBe(60_000)
  })

  it('never waits longer than an hour, whatever Retry-After says', async () => {
    const h = harness()
    const client = cloudClient(h.cloud.base, h.cloud.fetch, () => START)
    h.cloud.answerNextWith(busy({ 'retry-after': String(7 * 24 * 3600) }))
    const err = await client.requestConnection('k', 'https://hq.acme.example', 'Acme').catch((e: unknown) => e) as CloudBusyError
    expect(err.retryAt - START).toBe(3_600_000)
  })

  it('a poll answered 429 waits it out and goes on polling, and the request is approved all the same', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.answerNextWith(busy({ 'retry-after': '120' }))
    await h.advance(5_000)
    h.cloud.approve(userCode)
    await h.advance(60_000)
    expect(h.cloud.requests.filter(r => r.path === '/connect/token')).toHaveLength(1)
    await h.advance(60_000)
    expect((await h.connection.state()).connection?.name).toBe('Acme Robotics')
  })

  it('a token request answered 429 fails the call, and hq signs for none before Retry-After', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    await h.advance(300_000)
    h.cloud.answerNextWith(busy({ 'retry-after': '90' }))
    await expect(h.connection.accessToken()).rejects.toBeInstanceOf(CloudBusyError)
    await expect(h.connection.accessToken()).rejects.toBeInstanceOf(CloudBusyError)
    const tokenRequests = () => h.cloud.requests.filter(r => r.path === '/connect/token').length
    expect(tokenRequests()).toBe(2)
    await h.advance(90_000)
    expect(await h.connection.accessToken()).toMatch(/^tok_/)
    expect(tokenRequests()).toBe(3)
    expect(h.stored()).not.toBeNull()
  })
})
