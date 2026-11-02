/**
 * After a site restart, hq's app rows follow what the site reports (live preview phase 2's proof, Q10): an app the site
 * no longer runs reads as stopped, never as running.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ liveApp: { findMany: vi.fn(), update: vi.fn() } }))
const site = vi.hoisted(() => ({ askSite: vi.fn() }))
const socket = vi.hoisted(() => ({ emitLivePreviewChange: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../siteAsk', () => ({ askSite: site.askSite }))
vi.mock('../socket', () => socket)

import { followSiteApps, goneDetail } from '../appSync'

const ROW = { id: 'lp1', workspaceId: 'w1', branchId: 'b1' }
const NOW = new Date('2026-11-02T10:00:00Z')
const app = (id: string, state: string) => ({ id, state, livePreviewId: 'lp1', since: new Date(0), detail: null, lastLines: [] })

beforeEach(() => {
  vi.clearAllMocks()
  db.liveApp.update.mockResolvedValue({})
})

describe("hq's app rows after a site is heard again @SC-1704", () => {
  it('marks an app the site no longer runs as stopped, saying where', async () => {
    db.liveApp.findMany.mockResolvedValue([app('a1', 'running'), app('a2', 'stopped'), app('a3', 'failed')])
    site.askSite.mockResolvedValue({ ok: true, apps: [], services: [] })

    await followSiteApps('s1', 'Mac', ROW, NOW)

    expect(site.askSite).toHaveBeenCalledWith('s1', 'livePreview.appList', { livePreviewId: 'lp1' })
    expect(db.liveApp.findMany).toHaveBeenCalledWith({ where: { livePreviewId: 'lp1' } })
    expect(db.liveApp.update).toHaveBeenCalledTimes(1)
    expect(db.liveApp.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { state: 'stopped', since: NOW, detail: goneDetail('Mac') } })
    expect(socket.emitLivePreviewChange).toHaveBeenCalledWith(ROW, 'apps')
  })

  it('takes the state the site gives for an app it runs, and changes nothing that already agrees', async () => {
    db.liveApp.findMany.mockResolvedValue([app('a1', 'running'), app('a2', 'running')])
    site.askSite.mockResolvedValue({
      ok: true, services: [],
      apps: [
        { appId: 'a1', state: 'running', since: '2026-11-02T09:00:00Z', detail: null, lastLines: [] },
        { appId: 'a2', state: 'paused', since: '2026-11-02T09:30:00Z', detail: null, lastLines: ['x'] },
      ],
    })

    await followSiteApps('s1', 'Mac', ROW, NOW)

    expect(db.liveApp.update).toHaveBeenCalledTimes(1)
    expect(db.liveApp.update).toHaveBeenCalledWith({
      where: { id: 'a2' }, data: { state: 'paused', since: new Date('2026-11-02T09:30:00Z'), detail: null, lastLines: ['x'] },
    })
  })

  it('changes nothing when the site refuses, and tells no screen', async () => {
    db.liveApp.findMany.mockResolvedValue([app('a1', 'running')])
    site.askSite.mockResolvedValue({ ok: false, refusal: { code: 'unknown' } })

    await followSiteApps('s1', 'Mac', ROW, NOW)

    expect(db.liveApp.update).not.toHaveBeenCalled()
    expect(socket.emitLivePreviewChange).not.toHaveBeenCalled()
  })
})
