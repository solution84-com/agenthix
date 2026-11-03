/**
 * A person starting an app from the strip, in any live preview, `main`'s included (live preview phase 2's proof, Q8):
 * each app known on the workspace is offered with the command it was last started with, and *Start* runs it the way
 * `start_app` does, through HQ, for a Member or Admin only.
 */
import { withFeature } from '@agenthix/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { HttpError } = vi.hoisted(() => ({
  HttpError: class HttpError extends Error {
    constructor(readonly statusCode: number, m?: string) { super(m) }
  },
}))
const db = vi.hoisted(() => ({ liveApp: { findMany: vi.fn(), findFirst: vi.fn() } }))
const site = vi.hoisted(() => ({ askSite: vi.fn() }))
const store = vi.hoisted(() => ({ keepAppSeen: vi.fn(), readAppSeen: (v: unknown) => (v ? { state: 'stopped' } : null) }))
const reach = vi.hoisted(() => ({ reachLivePreview: vi.fn() }))
const start = vi.hoisted(() => ({ startAppIn: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: db, HttpError }))
vi.mock('../personActions', () => reach)
vi.mock('../appStart', () => ({ ...start, refusedText: (r: { detail: string }, done: string) => `${r.detail} ${done}` }))
vi.mock('../appStore', () => store)
vi.mock('../siteAsk', () => ({ ...site, SiteSilent: class extends Error {}, SiteFailed: class extends Error {} }))
vi.mock('../words', () => ({
  NOTHING: 'Nothing was changed.',
  refusalWords: () => 'The site refused.',
  siteSilent: (s: string) => new HttpError(503, `${s} isn't answering HQ now. Try again once it is back. Nothing was changed.`),
}))

import { appToOpenWith, startableApps } from '../knownApps'
import { restartLiveApp, startAppOnOpen, startLiveApp, stopLiveApp } from '../personApps'

const at = (iso: string) => new Date(iso)
const known = (over: Record<string, unknown>) => ({
  id: 'a', workspaceId: 'w1', branch: 'shop-1', name: 'shop', folder: '', command: 'npm run dev', port: 3000, state: 'stopped',
  livePreviewId: null, updatedAt: at('2026-11-01T00:00:00Z'), runs: [], ...over,
})
const MAIN = { id: 'lp-main', workspaceId: 'w1', branch: 'main', onMain: true, state: 'RUNNING', userId: 'u1' }
const BRANCH = { id: 'lp1', workspaceId: 'w1', branch: 'shop-1', onMain: false, state: 'RUNNING', userId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  reach.reachLivePreview.mockResolvedValue({ row: MAIN, site: { siteId: 's1', name: 'Mac' }, canAct: true })
})

withFeature('livePreview', () => {
describe('the apps a live preview offers to start @SC-1703', () => {
  it("offers main the apps last started on any branch, each once, with its latest command", async () => {
    db.liveApp.findMany.mockResolvedValue([
      known({ id: 'a1', branch: 'shop-1', command: 'npm run dev', runs: [{ startedAt: at('2026-11-01T10:00:00Z') }] }),
      known({ id: 'a2', branch: 'shop-2', command: 'npm run dev -- --port 3000', runs: [{ startedAt: at('2026-11-01T12:00:00Z') }] }),
      known({ id: 'a3', branch: 'shop-2', name: 'api', command: 'node api.js', port: 4000, folder: 'api' }),
    ])
    expect(await startableApps(MAIN)).toEqual([
      { name: 'api', folder: 'api', command: 'node api.js', port: 4000, fromBranch: 'shop-2' },
      { name: 'shop', folder: '', command: 'npm run dev -- --port 3000', port: 3000, fromBranch: 'shop-2' },
    ])
    expect(db.liveApp.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'w1' } }))
  })

  it("offers a branch only the apps started on that branch, leaving out one already going here", async () => {
    db.liveApp.findMany.mockResolvedValue([
      known({ id: 'a1', branch: 'shop-1', command: 'npm start', runs: [{ startedAt: at('2026-11-01T10:00:00Z') }] }),
      known({ id: 'a3', branch: 'shop-1', name: 'api', port: 4000, state: 'running', livePreviewId: 'lp1' }),
    ])
    expect(await startableApps(BRANCH)).toEqual([{ name: 'shop', folder: '', command: 'npm start', port: 3000, fromBranch: null }])
    expect(db.liveApp.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'w1', branch: 'shop-1' } }))
  })

  it('shows two names for one app (the same folder and port) once: the one started last', async () => {
    db.liveApp.findMany.mockResolvedValue([
      known({ id: 'a1', branch: 'shop-1', name: 'web', runs: [{ startedAt: at('2026-11-01T09:00:00Z') }] }),
      known({ id: 'a2', branch: 'shop-2', name: 'shop', runs: [{ startedAt: at('2026-11-01T12:00:00Z') }] }),
      known({ id: 'a3', branch: 'shop-2', name: 'api', folder: 'api', port: 4000 }),
    ])
    expect((await startableApps(MAIN)).map(a => a.name)).toEqual(['api', 'shop'])
  })

  it('opens a live preview with the known app started last, and with none when none is known', async () => {
    db.liveApp.findMany.mockResolvedValue([
      known({ id: 'a1', branch: 'shop-1', name: 'shop', runs: [{ startedAt: at('2026-11-01T12:00:00Z') }] }),
      known({ id: 'a3', branch: 'shop-1', name: 'api', folder: 'api', port: 4000, runs: [{ startedAt: at('2026-11-01T09:00:00Z') }] }),
    ])
    expect((await appToOpenWith(BRANCH))?.name).toBe('shop')
    db.liveApp.findMany.mockResolvedValue([])
    expect(await appToOpenWith(BRANCH)).toBeNull()
  })
})
})

withFeature('livePreview', () => {
describe('Start on the strip @SC-1703', () => {
  it('starts it in this live preview as it was last started, as the person, with no run', async () => {
    db.liveApp.findMany.mockResolvedValue([known({ id: 'a1', branch: 'shop-1', folder: 'web', command: 'npm run dev', port: 3000 })])
    start.startAppIn.mockResolvedValue({ ok: true, app: { id: 'a-main' }, status: {} })
    expect(await startLiveApp('u1', 'lp-main', 'shop')).toEqual({ appId: 'a-main' })
    expect(reach.reachLivePreview).toHaveBeenCalledWith('u1', 'lp-main', 'work')
    expect(start.startAppIn).toHaveBeenCalledWith(
      { row: MAIN, siteId: 's1', siteName: 'Mac', personId: 'u1' },
      { name: 'shop', folder: 'web', command: 'npm run dev', port: 3000 },
      null,
    )
  })

  it('is refused to a Viewer, as reaching the live preview to work refuses them', async () => {
    reach.reachLivePreview.mockRejectedValue(new HttpError(403, 'Viewers read only.'))
    await expect(startLiveApp('u2', 'lp-main', 'shop')).rejects.toMatchObject({ statusCode: 403 })
    expect(start.startAppIn).not.toHaveBeenCalled()
  })

  it('refuses a paused live preview, and an app nobody started on the workspace', async () => {
    reach.reachLivePreview.mockResolvedValueOnce({ row: { ...MAIN, state: 'PAUSED' }, site: { siteId: 's1', name: 'Mac' }, canAct: true })
    await expect(startLiveApp('u1', 'lp-main', 'shop')).rejects.toThrow(/paused. Resume it first. Nothing was changed./)
    db.liveApp.findMany.mockResolvedValue([])
    await expect(startLiveApp('u1', 'lp-main', 'shop')).rejects.toMatchObject({ statusCode: 404 })
    expect(start.startAppIn).not.toHaveBeenCalled()
  })

  it("says the site's refusal in HQ's words", async () => {
    db.liveApp.findMany.mockResolvedValue([known({ id: 'a1' })])
    start.startAppIn.mockResolvedValue({ ok: false, text: 'The folder web is not in the copy. Nothing was started.' })
    await expect(startLiveApp('u1', 'lp-main', 'shop')).rejects.toMatchObject({ statusCode: 409, message: 'The folder web is not in the copy. Nothing was started.' })
  })
})
})

withFeature('livePreview', () => {
describe("a person's start opens with the app @SC-1703", () => {
  it('starts the known app as the person who started the live preview, with no run', async () => {
    db.liveApp.findMany.mockResolvedValue([known({ id: 'a1', folder: 'web', runs: [{ startedAt: at('2026-11-01T12:00:00Z') }] })])
    start.startAppIn.mockResolvedValue({ ok: true, app: { id: 'a1' }, status: {} })
    await startAppOnOpen(BRANCH as never, { siteId: 's1', name: 'Mac' })
    expect(start.startAppIn).toHaveBeenCalledWith(
      { row: BRANCH, siteId: 's1', siteName: 'Mac', personId: 'u1' },
      { name: 'shop', folder: 'web', command: 'npm run dev', port: 3000 },
      null,
    )
  })

  it('starts nothing when no app is known or it is not running, and a failure never fails the start', async () => {
    db.liveApp.findMany.mockResolvedValue([])
    await startAppOnOpen(BRANCH as never, { siteId: 's1', name: 'Mac' })
    db.liveApp.findMany.mockResolvedValue([known({ id: 'a1' })])
    await startAppOnOpen({ ...BRANCH, state: 'STOPPED' } as never, { siteId: 's1', name: 'Mac' })
    expect(start.startAppIn).not.toHaveBeenCalled()
    start.startAppIn.mockRejectedValue(new Error('site gone'))
    await expect(startAppOnOpen(BRANCH as never, { siteId: 's1', name: 'Mac' })).resolves.toBeUndefined()
  })
})
})

withFeature('livePreview', () => {
describe('Stop and Restart on the strip @SC-1703', () => {
  const APP = { id: 'a1', workspaceId: 'w1', branch: 'shop-1', name: 'shop', folder: 'web', command: 'npm run dev', port: 3000 }
  beforeEach(() => {
    reach.reachLivePreview.mockResolvedValue({ row: BRANCH, site: { siteId: 's1', name: 'Mac' }, canAct: true })
    db.liveApp.findFirst.mockResolvedValue(APP)
    site.askSite.mockResolvedValue({ ok: true, result: { app: { appId: 'a1', state: 'stopped' } } })
    start.startAppIn.mockResolvedValue({ ok: true, app: { id: 'a1' }, status: {} })
  })

  it('stops one app of this live preview through its site, as the person, and keeps what the site says', async () => {
    await stopLiveApp('u1', 'lp1', 'a1')
    expect(db.liveApp.findFirst).toHaveBeenCalledWith({ where: { id: 'a1', workspaceId: 'w1', branch: 'shop-1' } })
    expect(site.askSite).toHaveBeenCalledWith('s1', 'livePreview.appStop', { livePreviewId: 'lp1', personId: 'u1', appId: 'a1' })
    expect(store.keepAppSeen).toHaveBeenCalledWith(APP, BRANCH, { state: 'stopped' })
    expect(start.startAppIn).not.toHaveBeenCalled()
  })

  it('restarts it as it was, in the same live preview, after stopping it', async () => {
    expect(await restartLiveApp('u1', 'lp1', 'a1')).toEqual({ appId: 'a1' })
    expect(site.askSite.mock.invocationCallOrder[0]).toBeLessThan(start.startAppIn.mock.invocationCallOrder[0]!)
    expect(start.startAppIn).toHaveBeenCalledWith(
      { row: BRANCH, siteId: 's1', siteName: 'Mac', personId: 'u1' },
      { name: 'shop', folder: 'web', command: 'npm run dev', port: 3000 },
      null,
    )
  })

  it('restarts an app the site no longer runs, as a start', async () => {
    site.askSite.mockResolvedValue({ ok: true, result: { refused: 'unknownApp', detail: 'not running' } })
    expect(await restartLiveApp('u1', 'lp1', 'a1')).toEqual({ appId: 'a1' })
  })

  it("refuses an app of another branch, a Viewer, and a paused live preview, changing nothing", async () => {
    db.liveApp.findFirst.mockResolvedValue(null)
    await expect(stopLiveApp('u1', 'lp1', 'a-other')).rejects.toMatchObject({ statusCode: 404 })
    reach.reachLivePreview.mockRejectedValueOnce(new HttpError(403, 'Viewers read only.'))
    await expect(restartLiveApp('u2', 'lp1', 'a1')).rejects.toMatchObject({ statusCode: 403 })
    reach.reachLivePreview.mockResolvedValueOnce({ row: { ...BRANCH, state: 'PAUSED' }, site: { siteId: 's1', name: 'Mac' }, canAct: true })
    await expect(stopLiveApp('u1', 'lp1', 'a1')).rejects.toThrow(/paused. Resume it first. Nothing was changed./)
    expect(site.askSite).not.toHaveBeenCalled()
    expect(start.startAppIn).not.toHaveBeenCalled()
  })

  it("says the site's refusal", async () => {
    site.askSite.mockResolvedValue({ ok: true, result: { refused: 'busy', detail: 'The app is starting.' } })
    await expect(stopLiveApp('u1', 'lp1', 'a1')).rejects.toMatchObject({ statusCode: 409, message: 'The app is starting. Nothing was changed.' })
  })
})
})
