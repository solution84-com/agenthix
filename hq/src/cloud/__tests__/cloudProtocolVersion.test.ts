/**
 * The Cloud protocol's version (core/src/cloud/version.ts), between hq and the stand-in Cloud server: hq states its
 * version and release on every call, the stand-in refuses a call it does not serve, and hq stops calling a Cloud too
 * far from its own, saying which side must upgrade.
 */
import { describe, expect, it } from 'vitest'
import { CLOUD_CHECK_IN_INTERVAL_S } from '@agenthix/core'
import { BUILD_INFO } from '../../server/buildInfo'
import { CloudProtocolError } from '../cloudClient'
import { connectedCloud } from './connectedCloud'
import { harness } from './connectionHarness'
import { CloudStandIn } from './cloudStandIn'

const VERSION = 'x-cloud-protocol-version'

describe('the Cloud protocol version @SC-1143', () => {
  it('hq states its protocol version and its release on every call to Cloud, whichever endpoint', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    h.setAddress('https://hq.acme.example/moved')
    await h.connection.startCheckIns()
    await h.connection.pledgeStatus('acct_1')
    await h.connection.sendDowntimeNotice({
      notice_id: 'n-1', kind: 'upgrade', at: '2026-01-03T10:00:00.000Z', expected_minutes: 10, affects: 'hq',
      recipients: ['acct_1'], withdrawn: false,
    })
    await h.connection.exchangeSignInCode({ code: 'not-a-code', redirectUri: 'https://hq.acme.example/login/cloud', codeVerifier: 'v'.repeat(43) })
      .catch(() => undefined)
    await h.connection.disconnect('u-sam')
    const paths = new Set(h.cloud.requests.map(r => r.path))
    expect(paths).toEqual(new Set([
      '/connect/device', '/connect/token', '/connect/address', '/connect/pledge/status', '/connect/notices/downtime', '/connect/revoke',
    ]))
    for (const r of h.cloud.requests) {
      expect(r.headers.get(VERSION), r.path).toBe('1.0')
      expect(r.headers.get('user-agent'), r.path).toBe(`hq/${BUILD_INFO.version}`)
    }
  })

  it('the stand-in refuses a call stating no version, or one two majors from its own, with 426 and its version', async () => {
    const cloud = new CloudStandIn(() => Date.UTC(2026, 0, 1))
    const call = (headers: Record<string, string>) => cloud.fetch('https://cloud.test/connect/device', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: '',
    })
    const statements: Record<string, string>[] = [{}, { [VERSION]: '3.0' }, { [VERSION]: 'one' }]
    for (const stated of statements) {
      const res = await call(stated)
      expect(res.status).toBe(426)
      expect(res.headers.get(VERSION)).toBe('1.0')
      expect(await res.json()).toEqual({ error: 'unsupported_protocol_version' })
    }
    // One major ahead is served (here refused only for its empty form), and the answer states Cloud's version.
    const served = await call({ [VERSION]: '2.4' })
    expect(served.status).toBe(400)
    expect(served.headers.get(VERSION)).toBe('1.0')
  })

  it('a Cloud two majors ahead refuses hq with 426: hq says HQ must upgrade, and asks it nothing more', async () => {
    const h = harness({ version: '3.0' })
    const refused = h.connection.connect('u-sam')
    await expect(refused).rejects.toBeInstanceOf(CloudProtocolError)
    await expect(refused).rejects.toThrow('Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.')
    expect(h.cloud.requests).toHaveLength(1)
    await h.advance(CLOUD_CHECK_IN_INTERVAL_S * 1000 * 2)
    await expect(h.connection.connect('u-sam')).rejects.toThrow('upgrade this HQ')
    expect(h.cloud.requests).toHaveLength(1)
  })

  it('an answer stating a version two majors ahead is refused the same, though Cloud did not refuse it', async () => {
    const h = harness()
    h.cloud.answerNextWith({ status: 200, body: {}, headers: { [VERSION]: '3.2' } })
    await expect(h.connection.connect('u-sam')).rejects.toThrow('speaks protocol 3.2 and this HQ speaks 1.0')
    await expect(h.connection.connect('u-sam')).rejects.toBeInstanceOf(CloudProtocolError)
    expect(h.cloud.requests).toHaveLength(1)
  })

  it('a connected hq whose Cloud moved two majors on stops checking in, and its waiting calls fail with why', async () => {
    const h = await connectedCloud()
    const before = h.cloud.requests.length
    h.cloud.version = '3.0'
    h.advance(CLOUD_CHECK_IN_INTERVAL_S * 1000 * 2)
    await h.connection.startCheckIns()
    expect(h.cloud.requests).toHaveLength(before + 1)
    await expect(h.connection.pledgeStatus('acct_1')).rejects.toThrow('upgrade this HQ')
    expect(h.cloud.requests).toHaveLength(before + 1)
    // The connection is kept: upgrading hq is what changes this, not a new connection.
    expect((await h.connection.state()).connection).not.toBeNull()
  })

  it("hq's state says why calls are refused once they are, and nothing before @SC-1075", async () => {
    const h = await connectedCloud()
    expect((await h.connection.state()).problem).toBeNull()
    h.cloud.version = '3.0'
    h.advance(CLOUD_CHECK_IN_INTERVAL_S * 1000 * 2)
    await h.connection.startCheckIns()
    expect((await h.connection.state()).problem).toBe('Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.')
    expect((await h.connection.state()).connection).not.toBeNull()
  })

  it('a refusal that only lasts an hour stops being said when the hour is over', async () => {
    const h = harness()
    h.cloud.answerNextWith({ status: 426, body: { error: 'unsupported_protocol_version' }, headers: { [VERSION]: '1.0' } })
    await expect(h.connection.connect('u-sam')).rejects.toBeInstanceOf(CloudProtocolError)
    expect((await h.connection.state()).problem).toContain('refused this HQ')
    await h.advance(CLOUD_CHECK_IN_INTERVAL_S * 1000)
    expect((await h.connection.state()).problem).toBeNull()
  })

  it('a 426 that does not say Cloud is ahead stops calls for an hour, then hq asks again', async () => {
    const h = harness()
    h.cloud.answerNextWith({ status: 426, body: { error: 'unsupported_protocol_version' }, headers: { [VERSION]: '1.0' } })
    await expect(h.connection.connect('u-sam')).rejects.toThrow("Agenthix Cloud speaks protocol 1.0 and refused this HQ's 1.0.")
    await h.advance(CLOUD_CHECK_IN_INTERVAL_S * 1000 - 1)
    await expect(h.connection.connect('u-sam')).rejects.toBeInstanceOf(CloudProtocolError)
    expect(h.cloud.requests).toHaveLength(1)
    await h.advance(1)
    await expect(h.connection.connect('u-sam')).resolves.toMatchObject({ userCode: expect.any(String) })
  })

  it('a Cloud whose answers state no version is read as 1.0, and works', async () => {
    const h = harness({ version: null })
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    expect((await h.connection.state()).connection).not.toBeNull()
  })

  it('a poll refused for its version ends the request as failed, rather than polling on', async () => {
    const h = harness()
    await h.connection.connect('u-sam')
    h.cloud.version = '3.0'
    await h.advance(5_000)
    expect(await h.connection.state()).toMatchObject({ connecting: null, lastAttempt: 'failed' })
    const polls = h.cloud.requests.length
    await h.advance(60_000)
    expect(h.cloud.requests).toHaveLength(polls)
  })
})
