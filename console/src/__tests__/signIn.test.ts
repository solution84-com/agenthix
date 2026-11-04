import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAM, startHarness, type Harness } from './harness'

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close() })

describe('signing in through hq @SC-864', () => {
  it('lets in an account that holds the fleet admin role, with an HTTP-only, same-site strict cookie', async () => {
    const res = await h.request('/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })
    expect(res.status).toBe(201)
    expect(res.json.user).toEqual({ id: SAM.id, name: SAM.name })
    expect(res.json.csrfToken).toEqual(expect.any(String))
    expect(res.setCookie).toMatch(/HttpOnly/)
    expect(res.setCookie).toMatch(/SameSite=Strict/)
    expect(h.link.callsOf('activity.record').map(c => c.action)).toContain('signedIn')
  })

  it('refuses a member without the role, and gives them no session', async () => {
    const res = await h.request('/api/session', { method: 'POST', body: { username: 'jordan', password: 'jordans password' } })
    expect(res.status).toBe(403)
    expect(res.json.message).toBe("This account isn't a fleet admin. A fleet admin can give you the role in the Fleet Console.")
    expect(res.setCookie).toBeNull()
  })

  it('refuses a wrong password', async () => {
    const res = await h.request('/api/session', { method: 'POST', body: { username: SAM.username, password: 'nope' } })
    expect(res.status).toBe(401)
    expect(res.setCookie).toBeNull()
  })

  it('refuses everyone while hq does not answer, and points to the command line on the machine', async () => {
    h.link.setState('disconnected')
    const res = await h.request('/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })
    expect(res.status).toBe(503)
    expect(res.json.error).toBe('hq_unreachable')
    expect(res.json.message).toMatch(/HQ is not answering/)
    expect(res.json.message).toMatch(/`agenthix status`/)
    expect(res.json.message).toMatch(/`agenthix restore`/)
    expect(h.link.callsOf('signIn.check')).toHaveLength(0)
  })

  it('limits failed attempts for one username', async () => {
    for (let i = 0; i < 10; i++) await h.request('/api/session', { method: 'POST', body: { username: 'sam', password: `guess ${i}` } })
    const res = await h.request('/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })
    expect(res.status).toBe(429)
  })

  it('counts attempts before hq answers, so a burst cannot all pass the limit', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    h.link.handle('signIn.check', async () => { await gate; return { ok: false } })
    const burst = Array.from({ length: 25 }, (_, i) => h.request('/api/session', { method: 'POST', body: { username: 'sam', password: `guess ${i}` } }))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(h.link.callsOf('signIn.check')).toHaveLength(10)
    release()
    const statuses = (await Promise.all(burst)).map(r => r.status)
    expect(statuses.filter(status => status === 429)).toHaveLength(15)
  })

  it('gives an attempt back when the password was right', async () => {
    for (let i = 0; i < 12; i++) expect((await h.request('/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })).status).toBe(201)
  })

  it('says before sign-in whether hq answers and whether anyone holds the role', async () => {
    const res = await h.request('/api/status')
    expect(res.json).toMatchObject({ hq: 'connected', fleetAdmins: 'some', machineName: 'hq-box' })
  })

  it('signs out', async () => {
    const { cookie, csrf } = await h.signIn()
    expect((await h.request('/api/session', { method: 'DELETE', cookie, csrf })).status).toBe(204)
    expect((await h.request('/api/session', { cookie, csrf })).status).toBe(401)
  })
})
