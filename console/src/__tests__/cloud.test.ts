import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAM, askAsShipped, startHarness, type Harness } from './harness'
import { withFeature } from '@agenthix/core/testing'

let h: Harness
beforeEach(async () => { h = await startHarness({ askFeatures: askAsShipped }) })
afterEach(async () => { await h.close() })

const TUNNEL = { 'x-remote-tunnel': '1' }

/** Every Cloud path that needs a session. */
const ROUTES: [string, string][] = [
  ['GET', '/api/remote-access'], ['POST', '/api/remote-access'], ['DELETE', '/api/remote-access'],
  ['GET', '/api/authenticator'], ['POST', '/api/authenticator'], ['POST', '/api/authenticator/check'], ['POST', '/api/authenticator/recovery-codes'],
  ['GET', '/api/cloud'],
  ['POST', '/api/cloud/account/sign-in'], ['DELETE', '/api/cloud/account/sign-in'], ['DELETE', '/api/cloud/account'],
  ['GET', '/api/cloud/sites'], ['GET', '/api/cloud/fleet-admins'],
]

/** The ones that would act, or read through Cloud: each says the organisation is not connected. */
const COMING = ROUTES.filter(([method, path]) =>
  (method !== 'GET' || path === '/api/cloud/sites' || path === '/api/cloud/fleet-admins'))

const send = (method: string, path: string, auth: object) =>
  h.request(path, { method, body: method === 'POST' ? {} : undefined, ...auth })

describe('Cloud routes while Agenthix Cloud is off (adr-0189) @SC-2133', () => {
  it.each(ROUTES)('%s %s answers not available, after the session check, and asks hq nothing about Cloud', async (method, path) => {
    expect((await h.request(path, { method })).status).toBe(401)
    const auth = await h.signIn()
    const res = await send(method, path, auth)
    expect(res.status).toBe(404)
    expect(res.json.error).toBe('not_found')
    expect(h.link.callsOf('cloud.state')).toHaveLength(0)
  })

  it('the platform\'s Cloud reads answer not available too', async () => {
    const auth = await h.signIn()
    for (const path of ['/api/cloud/asks', '/api/cloud/offers']) expect((await h.request(path, auth)).status).toBe(404)
    expect((await h.request('/api/cloud/offers/site/dismiss', { method: 'POST', body: {}, ...auth })).status).toBe(404)
  })
})

withFeature('cloud', () => {
  describe('Cloud routes', () => {
    it.each(ROUTES)('%s %s needs a session @SC-1074', async (method, path) => {
      expect((await h.request(path, { method })).status).toBe(401)
    })

    it.each(COMING)('%s %s says the organisation is not connected and does nothing else @SC-1074', async (method, path) => {
      const auth = await h.signIn()
      const recorded = h.link.callsOf('activity.record').length
      const res = await send(method, path, auth)
      expect(res.status).toBe(409)
      expect(res.json.error).toBe('not_connected')
      expect(res.json.message).toBe('This organisation is not connected to Agenthix Cloud.')
      expect(h.link.callsOf('activity.record')).toHaveLength(recorded)
    })

    it('reads say plainly that nothing is connected, linked, on or set up yet @SC-1074', async () => {
      const auth = await h.signIn()
      expect((await h.request('/api/cloud', auth)).json).toEqual({ organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: 'https://cloud.agenthix.com', runByCloud: false, problem: null })
      expect((await h.request('/api/remote-access', auth)).json).toEqual({ state: { on: false }, organisationConnected: false, place: 'onTheMachine' })
      expect((await h.request('/api/authenticator', auth)).json).toEqual({ code: null, place: 'onTheMachine' })
      const remote = { ...auth, headers: TUNNEL }
      expect((await h.request('/api/cloud', remote)).json.place).toBe('throughRemoteAccess')
    })

    it('checks how long before it says so @SC-1074', async () => {
      const auth = await h.signIn()
      for (const forMinutes of [0, -5, 1.5, 'long', 481]) {
        expect((await h.request('/api/remote-access', { method: 'POST', body: { forMinutes }, ...auth })).status).toBe(400)
      }
      for (const forMinutes of [1, 120, 480]) {
        expect((await h.request('/api/remote-access', { method: 'POST', body: { forMinutes }, ...auth })).status).toBe(409)
      }
    })

    it('a session through the remote tunnel can never turn it on or extend it, or set up the code @SC-1073', async () => {
      const auth = { ...(await h.signIn()), headers: TUNNEL }
      const asks: [string, string, object | undefined][] = [
        ['POST', '/api/remote-access', {}], ['POST', '/api/remote-access', { forMinutes: 30 }], ['POST', '/api/authenticator', {}], ['POST', '/api/authenticator/check', { code: '482175' }],
        ['POST', '/api/authenticator/recovery-codes', {}], 
      ]
      for (const [method, path, body] of asks) {
        const res = await h.request(path, { method, body, ...auth })
        expect(res.status).toBe(403)
        expect(res.json.error).toBe('not_from_here')
      }
    })

    it('a session through the tunnel can still turn it off, and sign out of Cloud @SC-1073', async () => {
      const auth = { ...(await h.signIn()), headers: TUNNEL }
      expect((await h.request('/api/remote-access', { method: 'DELETE', ...auth })).status).toBe(409)
      expect((await h.request('/api/cloud/account/sign-in', { method: 'DELETE', ...auth })).status).toBe(409)
    })
  })
})

describe('signing in through remote access @SC-1072', () => {
  const body = (extra: object = {}) => ({ username: SAM.username, password: SAM.password, ...extra })

  it('the sign-in page is told where it was opened from, before anyone signs in', async () => {
    expect((await h.request('/api/sign-in/remote')).json).toEqual({ remote: false })
    expect((await h.request('/api/sign-in/remote', { headers: TUNNEL })).json).toEqual({ remote: true })
  })

  it('on the machine, the HQ login alone is enough, as before', async () => {
    const res = await h.request('/api/session', { method: 'POST', body: body() })
    expect(res.status).toBe(201)
    expect(h.link.callsOf('signIn.check')).toHaveLength(1)
  })

  it('through remote access, the HQ login alone opens nothing, and HQ is not even asked', async () => {
    const res = await h.request('/api/session', { method: 'POST', body: body(), headers: TUNNEL })
    expect(res.status).toBe(401)
    expect(res.json.error).toBe('code_needed')
    expect(res.setCookie).toBeNull()
    expect(h.link.callsOf('signIn.check')).toHaveLength(0)
  })

  it('a code that is not six digits, or a recovery code that is not one, is refused as malformed', async () => {
    for (const extra of [{ code: '12345' }, { code: 'abcdef' }, { recoveryCode: 'nope' }, { code: '123456', recoveryCode: 'k7qm-2xpa' }]) {
      const res = await h.request('/api/session', { method: 'POST', body: body(extra), headers: TUNNEL })
      expect(res.status).toBe(400)
      expect(res.setCookie).toBeNull()
    }
  })

  it('with a code, it says no code is set up, opens no session and asks HQ nothing', async () => {
    for (const extra of [{ code: '603914' }, { recoveryCode: 'k7qm-2xpa' }]) {
      const res = await h.request('/api/session', { method: 'POST', body: body(extra), headers: TUNNEL })
      expect(res.status).toBe(401)
      expect(res.json.error).toBe('no_code')
      expect(res.setCookie).toBeNull()
    }
    expect(h.link.callsOf('signIn.check')).toHaveLength(0)
  })
})
