import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRemoteAuthenticator } from '@agenthix/core'
import { recoveryCodeHash } from '../auth/authenticators'
import { base32Decode, hotp, TOTP_STEP_MS } from '../auth/totp'
import { SAM, askAsShipped, startHarness, type Harness } from './harness'
import { NAME, remoteRequest, turnOn } from './remoteHelpers'
import { withFeature } from '@agenthix/core/testing'

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const RECOVERY = 'abcd-2345'
const codeAt = (ms: number) => hotp(base32Decode(SECRET), Math.floor(ms / TOTP_STEP_MS))

function addAuthenticator(h: Harness, id = 'auth-1'): void {
  const hashes = [recoveryCodeHash(RECOVERY), ...Array.from({ length: 9 }, (_, i) => String(i).repeat(64))]
  const checked = checkRemoteAuthenticator({ id, secret: SECRET, recoveryCodeHashes: hashes, claimBefore: new Date(Date.now() + 86400_000).toISOString() }, new Date())
  if (!checked.ok) throw new Error(checked.message)
  expect(h.ctx.authenticators.add(checked.value)).toEqual({ added: true })
}

let h: Harness
let port: number
const signIn = (body: Record<string, unknown>) =>
  remoteRequest(port, '/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password, ...body } })

beforeEach(async () => {
  h = await startHarness({ askFeatures: askAsShipped })
  port = (await turnOn(h.ctx.remoteAccess, h.state)).port
})
afterEach(async () => { await h.close() })

withFeature('cloud', () => {
  describe('signing in through remote access on a machine Cloud runs @SC-1072', () => {
    it('needs a code besides the HQ login', async () => {
      addAuthenticator(h)
      const res = await remoteRequest(port, '/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })
      expect(res.status).toBe(401)
      expect(res.json.error).toBe('code_needed')
      expect(res.setCookie).toBeNull()
    })

    it('claims an unclaimed authenticator with a valid code; the session, with a Secure cookie, works through remote access only', async () => {
      addAuthenticator(h)
      const res = await signIn({ code: codeAt(Date.now()) })
      expect(res.status).toBe(201)
      expect(res.setCookie).toMatch(/HttpOnly/)
      expect(res.setCookie).toMatch(/; Secure/)
      const auth = { cookie: res.setCookie!.split(';')[0]!, csrf: res.json.csrfToken as string }
      expect((await remoteRequest(port, '/api/session', auth)).status).toBe(200)
      expect((await h.request('/api/session', auth)).status).toBe(401)
      expect(h.ctx.authenticators.hasOwn(SAM.id)).toBe(true)
      const claimed = h.link.callsOf('activity.record').find(c => c.action === 'remoteAccess.authenticatorClaimed')
      expect(claimed).toMatchObject({ byUserId: SAM.id, announce: true })
    })

    it('takes a code once: the same six digits do not open a second session', async () => {
      addAuthenticator(h)
      const code = codeAt(Date.now())
      expect((await signIn({ code })).status).toBe(201)
      expect((await signIn({ code })).status).toBe(401)
    })

    it('takes a recovery code once, from the person\'s own authenticator', async () => {
      addAuthenticator(h)
      expect((await signIn({ recoveryCode: RECOVERY })).status).toBe(401)
      expect((await signIn({ code: codeAt(Date.now()) })).status).toBe(201)
      expect((await signIn({ recoveryCode: RECOVERY.toUpperCase() })).status).toBe(201)
      expect((await signIn({ recoveryCode: RECOVERY })).status).toBe(401)
    })

    it('a wrong code, a wrong password and an account without the role get the same answer', async () => {
      addAuthenticator(h)
      const wrongCode = await signIn({ code: codeAt(Date.now() + 5 * TOTP_STEP_MS) })
      const wrongPassword = await signIn({ password: 'nope', code: codeAt(Date.now()) })
      const member = await remoteRequest(port, '/api/session', { method: 'POST', body: { username: 'jordan', password: 'jordans password', code: codeAt(Date.now()) } })
      for (const res of [wrongCode, wrongPassword, member]) {
        expect(res.status).toBe(401)
        expect(res.json).toEqual({ error: 'wrong', message: 'That username, password and code do not match.' })
        expect(res.setCookie).toBeNull()
      }
      expect(h.ctx.authenticators.hasOwn(SAM.id)).toBe(false)
    })

    it('says so when no authenticator is set up', async () => {
      const res = await signIn({ code: '123456' })
      expect(res.status).toBe(401)
      expect(res.json.error).toBe('no_code')
    })

    it('limits wrong codes as it limits wrong passwords', async () => {
      addAuthenticator(h)
      for (let i = 0; i < 10; i++) await signIn({ code: codeAt(Date.now() + 10 * TOTP_STEP_MS) })
      expect((await signIn({ code: codeAt(Date.now()) })).status).toBe(429)
    })

    it('a session opened on the machine opens nothing through remote access', async () => {
      const local = await h.signIn()
      expect((await remoteRequest(port, '/api/session', local)).status).toBe(401)
    })

    it('answers only at its name, and only same-origin over https', async () => {
      expect((await remoteRequest(port, '/api/status', { host: 'evil.example' })).status).toBe(421)
      expect((await remoteRequest(port, '/api/status', { host: `${NAME}:${port}` })).status).toBe(200)
      expect((await remoteRequest(port, '/api/status', { host: '127.0.0.1' })).status).toBe(421)
      const post = (origin: string) => remoteRequest(port, '/api/session', { method: 'POST', body: {}, headers: { origin } })
      expect((await post(`http://${NAME}`)).status).toBe(403)
      expect((await post(`https://${NAME}`)).status).not.toBe(403)
    })

    it('a session through it can never turn remote access on @SC-1073', async () => {
      addAuthenticator(h)
      const res = await signIn({ code: codeAt(Date.now()) })
      const auth = { cookie: res.setCookie!.split(';')[0]!, csrf: res.json.csrfToken as string }
      const on = await remoteRequest(port, '/api/remote-access', { method: 'POST', body: {}, ...auth })
      expect(on.status).toBe(403)
      expect((await remoteRequest(port, '/api/cloud', auth)).json.place).toBe('throughRemoteAccess')
    })

    it('ending remote access ends the sessions that came through it, and no other @SC-1073', async () => {
      addAuthenticator(h)
      const local = await h.signIn()
      expect((await signIn({ code: codeAt(Date.now()) })).status).toBe(201)
      await h.ctx.remoteAccess.off()
      expect((await h.request('/api/session', local)).status).toBe(200)
      expect(h.ctx.sessions.userIds()).toEqual([SAM.id])
      const state = h.state.readJson('sessions.json') as { sessions: { remote?: true }[] }
      expect(state.sessions.filter(s => s.remote)).toEqual([])
    })
  })
})
