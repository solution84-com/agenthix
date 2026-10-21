import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HqCallError } from '../hq/link'
import { startHarness, type Harness } from './harness'

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close() })

describe('fleet admins and the fleet', () => {
  it('lists who holds the role, as hq says @SC-886', async () => {
    const auth = await h.signIn()
    const res = await h.request('/api/fleet-admins', auth)
    // The harness's hq gives no date for the role: it is not known.
    expect(res.json.admins).toEqual([{ id: 'u-sam', name: 'Sam Rivera', username: 'sam', organisationAdmin: true, since: null }])
  })

  it('grants the role through hq, on behalf of the signed-in fleet admin, and records nothing of its own: hq records and announces it @SC-886', async () => {
    h.link.handle('fleetAdmin.grant', () => ({ granted: true }))
    const auth = await h.signIn()
    const res = await h.request('/api/fleet-admins', { method: 'POST', body: { userId: 'u-avery' }, ...auth })
    expect(res.status).toBe(200)
    expect(h.link.callsOf('fleetAdmin.grant')).toEqual([{ userId: 'u-avery', byUserId: 'u-sam' }])
    expect(h.link.callsOf('activity.record').filter(c => c.action.startsWith('fleetAdmin.'))).toEqual([])
  })

  it('takes the role away through hq, on behalf of the signed-in fleet admin, and records nothing of its own @SC-886', async () => {
    h.link.handle('fleetAdmin.revoke', () => ({ revoked: true }))
    const auth = await h.signIn()
    const res = await h.request('/api/fleet-admins/u-avery', { method: 'DELETE', ...auth })
    expect(res.status).toBe(200)
    expect(h.link.callsOf('fleetAdmin.revoke')).toEqual([{ userId: 'u-avery', byUserId: 'u-sam' }])
    expect(h.link.callsOf('activity.record').filter(c => c.action.startsWith('fleetAdmin.'))).toEqual([])
  })

  it('passes on hq’s refusal to remove the last fleet admin, in hq’s words @SC-886', async () => {
    h.link.handle('fleetAdmin.revoke', () => { throw new HqCallError('not_allowed', 'Sam Rivera is the only fleet admin; give someone else the role first.') })
    const auth = await h.signIn()
    const res = await h.request('/api/fleet-admins/u-sam', { method: 'DELETE', ...auth })
    expect(res.status).toBe(403)
    expect(res.json.message).toMatch(/only fleet admin/)
  })

  it('finds an HQ account by its username, asked of hq for the person signed in @SC-886', async () => {
    const jordan = { id: 'u-jordan', name: 'Jordan Lee', username: 'jordan', organisationAdmin: true, fleetAdmin: false }
    h.link.handle('account.find', ({ username }) => ({ account: username === 'jordan' ? jordan : null }))
    const auth = await h.signIn()
    expect((await h.request('/api/fleet-admins/find?username=Jordan', auth)).json).toEqual({ account: jordan })
    expect(h.link.callsOf('account.find')).toEqual([{ byUserId: 'u-sam', username: 'jordan' }])
    expect((await h.request('/api/fleet-admins/find?username=nobody', auth)).json).toEqual({ account: null })
    expect((await h.request('/api/fleet-admins/find?username=', auth)).status).toBe(400)
  })

  it('says HQ is older than finding an account when hq does not know the method @SC-886', async () => {
    const auth = await h.signIn()
    expect((await h.request('/api/fleet-admins/find?username=jordan', auth)).json).toMatchObject({ error: 'hq_too_old' })
  })

  it('ends the sessions of the person whose role it removed, at once @SC-863', async () => {
    h.link.handle('fleetAdmin.revoke', () => ({ revoked: true }))
    const auth = await h.signIn()
    expect((await h.request('/api/fleet', auth)).status).toBe(200)
    await h.request('/api/fleet-admins/u-sam', { method: 'DELETE', ...auth })
    expect((await h.request('/api/fleet', auth)).status).toBe(401)
  })

  it('ends the sessions of a person hq says lost the role elsewhere, at once @SC-863', async () => {
    const auth = await h.signIn()
    expect((await h.request('/api/fleet', auth)).status).toBe(200)
    h.link.emit('fleetAdminRemoved', 'u-sam')
    expect((await h.request('/api/fleet', auth)).status).toBe(401)
  })

  it("shows the fleet: the console's own machine and the machines it pinned @SC-888", async () => {
    const auth = await h.signIn()
    const res = await h.request('/api/fleet', auth)
    expect(res.status).toBe(200)
    expect(res.json.console).toMatchObject({ machineName: 'hq-box', hq: 'connected' })
    expect(res.json.hosts).toEqual([])
  })
})
