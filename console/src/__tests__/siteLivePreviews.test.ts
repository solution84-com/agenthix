import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import type { SiteLivePreviewsView } from '@agenthix/core'
import { HqCallError } from '../hq/link'
import { FakeHost } from './fakes'
import { askAsShipped, startHarness, type Harness } from './harness'

// Live previews on the organisation's sites in the Fleet Console: hq holds and decides, and checks the role again on every call.

const at = '2026-11-01T09:00:00.000Z'
const view = (over: Partial<SiteLivePreviewsView> = {}): SiteLivePreviewsView => ({
  executionSiteId: 'es-office', allowed: true, limit: null, idleMinutes: 120, problems: [],
  capacity: { open: 1, limit: null, memoryPercent: 41, cpuPercent: 12 },
  livePreviews: [{
    livePreviewId: 'lp1', projectName: 'Fernhill Shop', workspaceName: 'shop-app', branch: 'login-page',
    person: { id: 'u-mia', name: 'Mia Chen' }, state: 'running', openedAt: at, lastUsedAt: at,
  }],
  ...over,
})

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let hqBox: FakeHost
beforeEach(async () => {
  h = await startHarness({ askFeatures: askAsShipped })
  ;[office, hqBox] = await Promise.all([FakeHost.create(), FakeHost.create()])
  auth = await h.signIn()
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: at, connectedBy: 'u-sam',
  })
  await h.ctx.hosts.pin({
    fingerprint: hqBox.fingerprint, hostId: 'h-hq', identity: hqBox.keys.identity, machineName: 'hq-box',
    siteName: 'hq-box', executionSiteId: null, connectedAt: at, connectedBy: null, hqMachine: true,
  })
  h.link.handle('sites.livePreviews', () => view())
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const previews = (fp = () => office.fingerprint) => `/api/sites/${fp()}/live-previews`
const setting = { allowed: true, limit: null, idleMinutes: 120 }

describe('Live previews on a site while the live preview is off (adr-0172)', () => {
  it('answers every route 404, saying it is not available, and asks hq nothing about live previews', async () => {
    for (const [path, method, body] of [[previews(), 'GET'], [previews(), 'PUT', setting], [`${previews()}/lp1`, 'DELETE']] as const) {
      const res = await api(path, method, body)
      expect(res.status, `${method} ${path}`).toBe(404)
      expect(String(res.json.message), `${method} ${path}`).toMatch(/not available.*Nothing was changed\.$/)
    }
    expect(h.link.calls.filter(c => c.method.startsWith('sites.'))).toEqual([])
  })

  it('tells the screens it is off', async () => {
    expect((await api('/api/features')).json.on).not.toContain('livePreview')
  })
})

withFeature('livePreview', () => {
  describe('Live previews on a site, through hq @SC-1754', () => {
    it('refuses everything to someone who is not signed in', async () => {
      for (const [path, method] of [[previews(), 'GET'], [previews(), 'PUT'], [`${previews()}/lp1`, 'DELETE']] as const) {
        expect((await h.request(path, { method, body: method === 'GET' ? undefined : {} })).status, `${method} ${path}`).toBe(401)
      }
      expect(h.link.calls.filter(c => c.method.startsWith('sites.'))).toEqual([])
    })

    it('passes hq’s refusal of an account without the fleet admin role', async () => {
      const no = () => { throw new HqCallError('not_allowed', 'Not a fleet admin.') }
      h.link.handle('sites.livePreviews', no)
      h.link.handle('sites.livePreviews.set', no)
      h.link.handle('sites.livePreviews.stop', no)
      expect((await api(previews())).status).toBe(403)
      expect((await api(previews(), 'PUT', setting)).status).toBe(403)
      expect((await api(`${previews()}/lp1`, 'DELETE')).status).toBe(403)
    })

    it('reads the site’s live previews, asked as the signed-in fleet admin for the site hq knows by its id', async () => {
      const res = await api(previews())
      expect(res.status).toBe(200)
      expect(res.json.view).toMatchObject({ allowed: true, limit: null, idleMinutes: 120, capacity: { open: 1, memoryPercent: 41 }, livePreviews: [{ livePreviewId: 'lp1', person: { name: 'Mia Chen' } }] })
      expect(h.link.callsOf('sites.livePreviews')).toEqual([{ byUserId: 'u-sam', executionSiteId: 'es-office' }])
    })

    it('finds hq’s own site by the default site it reports', async () => {
      h.link.handle('site.loads', () => ({ sites: [{ executionSiteId: 'es-default', isDefault: true, running: 0, maxAtOnce: 4, reportedAt: at }] }))
      h.link.handle('sites.livePreviews', ({ executionSiteId }) => view({ executionSiteId }))
      expect((await api(previews(() => hqBox.fingerprint))).json.view).toMatchObject({ executionSiteId: 'es-default' })
    })

    it('says so when the site is not one hq knows', async () => {
      expect((await api(previews(() => hqBox.fingerprint))).status).toBe(409)
      expect((await api(`/api/sites/${'f'.repeat(64)}/live-previews`)).status).toBe(404)
      expect(h.link.callsOf('sites.livePreviews')).toEqual([])
    })

    it('drops an answer that is not in its shape, and says an older hq is older', async () => {
      h.link.handle('sites.livePreviews', () => ({ allowed: 'yes' }) as unknown as SiteLivePreviewsView)
      expect((await api(previews())).status).toBe(502)
      h.link.handle('sites.livePreviews', () => { throw new HqCallError('unknown_method', 'no') })
      expect((await api(previews())).status).toBe(501)
    })

    it('sets live previews, the limit and the idle stop, only to values hq accepts', async () => {
      h.link.handle('sites.livePreviews.set', p => ({ view: view({ allowed: p.allowed, limit: p.limit, idleMinutes: p.idleMinutes }), stopped: [] }))
      for (const bad of [
        { ...setting, allowed: 'on' }, { ...setting, limit: 0 }, { ...setting, limit: 99 }, { ...setting, limit: 2.5 },
        { ...setting, idleMinutes: 1 }, { ...setting, idleMinutes: 'soon' }, { allowed: true, limit: null },
      ]) {
        expect((await api(previews(), 'PUT', bad)).status, JSON.stringify(bad)).toBe(400)
      }
      expect(h.link.callsOf('sites.livePreviews.set')).toEqual([])
      const res = await api(previews(), 'PUT', { allowed: true, limit: 3, idleMinutes: 30 })
      expect(res.status).toBe(200)
      expect(res.json.view).toMatchObject({ allowed: true, limit: 3, idleMinutes: 30 })
      expect(h.link.callsOf('sites.livePreviews.set')).toEqual([{ byUserId: 'u-sam', executionSiteId: 'es-office', allowed: true, limit: 3, idleMinutes: 30 }])
    })

    it('turning live previews off lists the ones it stops and asks first', async () => {
      h.link.handle('sites.livePreviews.set', p => ({ view: view({ allowed: p.allowed, livePreviews: [], capacity: null }), stopped: ['lp1'] }))
      const asked = await api(previews(), 'PUT', { ...setting, allowed: false })
      expect(asked.status).toBe(409)
      expect(asked.json.livePreviews).toMatchObject([{ livePreviewId: 'lp1', person: { name: 'Mia Chen' } }])
      expect(String(asked.json.message)).toContain('Nothing was changed.')
      expect(h.link.callsOf('sites.livePreviews.set')).toEqual([])
      const done = await api(previews(), 'PUT', { ...setting, allowed: false, stopAll: true })
      expect(done.json).toMatchObject({ stopped: ['lp1'], view: { allowed: false } })
      expect(h.link.callsOf('sites.livePreviews.set')).toEqual([{ byUserId: 'u-sam', executionSiteId: 'es-office', allowed: false, limit: null, idleMinutes: 120 }])
    })

    it('turns live previews off without asking when none is open', async () => {
      h.link.handle('sites.livePreviews', () => view({ livePreviews: [], capacity: null }))
      h.link.handle('sites.livePreviews.set', p => ({ view: view({ allowed: p.allowed, livePreviews: [] }), stopped: [] }))
      expect((await api(previews(), 'PUT', { ...setting, allowed: false })).status).toBe(200)
    })

    it('stops one live preview by its id, and nothing that is not an id', async () => {
      h.link.handle('sites.livePreviews.stop', () => ({ stopped: true }))
      expect((await api(`${previews()}/lp1`, 'DELETE')).json).toEqual({ stopped: true })
      expect(h.link.callsOf('sites.livePreviews.stop')).toEqual([{ byUserId: 'u-sam', executionSiteId: 'es-office', livePreviewId: 'lp1' }])
      expect((await api(`${previews()}/${encodeURIComponent('../x y')}`, 'DELETE')).status).toBe(400)
      expect(h.link.callsOf('sites.livePreviews.stop')).toHaveLength(1)
    })

    it('opens the site’s page from a notice about its memory or a live preview stopped for it', async () => {
      h.link.handle('notices.list', () => ({ notices: [
        { id: 'n1', kind: 'siteMemoryHigh', title: 'office-server is busy', body: 'Memory is at 85%.', at, dismissible: true, hostId: 'h-office' },
        { id: 'n2', kind: 'livePreviewStoppedForResources', title: 'A live preview was stopped', body: '', at, dismissible: true, hostId: 'h-hq' },
        { id: 'n3', kind: 'siteMemoryRecovered', title: 'back', body: '', at, dismissible: true, hostId: null },
      ] }))
      const res = await api('/api/notices')
      expect((res.json.notices as { target: unknown }[]).map(n => n.target)).toEqual([
        { page: 'site', fingerprint: office.fingerprint }, { page: 'site', fingerprint: hqBox.fingerprint }, { page: 'dashboard' },
      ])
    })
  })
})
