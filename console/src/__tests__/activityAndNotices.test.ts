import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FleetNotice } from '@agenthix/core'
import { HqCallError } from '../hq/link'
import { FakeHost } from './fakes'
import { SAM, startHarness, type Harness } from './harness'

// What fleet admins did and what they are told (spec §7, §10): asked of hq on behalf of the person signed in, each
// answer parsed field by field, and an hq older than the methods said so rather than shown as nothing.

let h: Harness
let auth: { cookie: string; csrf: string }
const at = '2026-10-15T13:02:00.000Z'

beforeEach(async () => {
  h = await startHarness()
  auth = await h.signIn()
})
afterEach(async () => { await h.close() })

describe('the record of what fleet admins did @SC-883', () => {
  const entry = { id: 'a1', at, by: { id: SAM.id, name: SAM.name }, action: 'site.added', subject: 'office on office-server (ab12)' }

  it('is asked of hq for the person signed in, and passed on as hq gave it', async () => {
    h.link.handle('activity.list', () => ({ entries: [entry, { ...entry, id: 'bad id!' }], next: 'a1' }))
    const res = await h.request('/api/activity', auth)
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ entries: [entry], next: 'a1' })
    expect(h.link.callsOf('activity.list')).toEqual([{ byUserId: SAM.id }])
  })

  it('asks for the page after the one given, and refuses a page that is not an id', async () => {
    h.link.handle('activity.list', () => ({ entries: [], next: null }))
    await h.request('/api/activity?after=a1', auth)
    expect(h.link.callsOf('activity.list')).toEqual([{ byUserId: SAM.id, after: 'a1' }])
    expect((await h.request('/api/activity?after=..%2Fx', auth)).status).toBe(400)
  })

  it('says HQ is older than the record when hq does not know the method', async () => {
    const res = await h.request('/api/activity', auth)
    expect(res.status).toBe(501)
    expect(res.json).toMatchObject({ error: 'hq_too_old' })
  })

  it('says HQ is not answering when the link is down', async () => {
    h.link.state = 'disconnected'
    expect((await h.request('/api/activity', auth)).status).toBe(503)
  })

  it('is not read without a session', async () => {
    expect((await h.request('/api/activity')).status).toBe(401)
  })
})

describe('the notices @SC-884', () => {
  const notice = (over: Partial<FleetNotice> = {}): FleetNotice => ({
    id: 'n1', kind: 'machineNotHeardFrom', title: 'Not heard from office-server since 09:14', body: 'It may be switched off.',
    at, dismissible: false, hostId: 'h-office', ...over,
  })

  it('each carry what it opens: the machine a machine’s notice is about by its fingerprint, and the page of the thing it names', async () => {
    const fake = await FakeHost.create()
    await h.ctx.hosts.pin({
      fingerprint: fake.fingerprint, hostId: 'h-office', identity: fake.keys.identity, machineName: 'office-server', siteName: 'office',
      executionSiteId: 'es-office', connectedAt: at, connectedBy: null,
    })
    h.link.handle('notices.list', () => ({ notices: [notice(), notice({ id: 'n2', hostId: 'h-gone' }), notice({ id: 'n3', kind: 'activity', hostId: null, dismissible: true })] }))
    const res = await h.request('/api/notices', auth)
    expect(res.status).toBe(200)
    expect(res.json.notices).toEqual([
      { id: 'n1', kind: 'machineNotHeardFrom', title: notice().title, body: notice().body, at, dismissible: false, fingerprint: fake.fingerprint, target: { page: 'site', fingerprint: fake.fingerprint } },
      { id: 'n2', kind: 'machineNotHeardFrom', title: notice().title, body: notice().body, at, dismissible: false, fingerprint: null, target: { page: 'dashboard' } },
      // An announced action names its machine in words: hq's title for it, and the subject recorded here.
      { id: 'n3', kind: 'activity', title: notice().title, body: notice().body, at, dismissible: true, fingerprint: null, target: { page: 'site', fingerprint: fake.fingerprint } },
    ])
    expect(h.link.callsOf('notices.list')).toEqual([{ byUserId: SAM.id }])
  })

  it('are put away in hq on behalf of the person signed in', async () => {
    h.link.handle('notices.dismiss', () => ({ dismissed: true }))
    const res = await h.request('/api/notices/n3/dismiss', { method: 'POST', ...auth })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ dismissed: true })
    expect(h.link.callsOf('notices.dismiss')).toEqual([{ byUserId: SAM.id, noticeId: 'n3' }])
  })

  it('pass on hq’s refusal to put away one that clears itself', async () => {
    h.link.handle('notices.dismiss', () => { throw new HqCallError('not_allowed', 'This notice clears itself once the machine is back, or removed.') })
    const res = await h.request('/api/notices/n1/dismiss', { method: 'POST', ...auth })
    expect(res.status).toBe(403)
    expect(res.json.message).toMatch(/clears itself/)
  })

  it('say HQ is older than them when hq does not know the method', async () => {
    expect((await h.request('/api/notices', auth)).json).toMatchObject({ error: 'hq_too_old' })
  })
})
