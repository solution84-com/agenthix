/**
 * A person starting an app from the strip, in any live preview, `main`'s included (live preview phase 2's proof, Q8):
 * each app known on the workspace is offered with the command it was last started with, and *Start* runs it the way
 * `start_app` does, through HQ, for a Member or Admin only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { HttpError } = vi.hoisted(() => ({
  HttpError: class HttpError extends Error {
    constructor(readonly statusCode: number, m?: string) { super(m) }
  },
}))
const db = vi.hoisted(() => ({ liveApp: { findMany: vi.fn() } }))
const reach = vi.hoisted(() => ({ reachLivePreview: vi.fn() }))
const start = vi.hoisted(() => ({ startAppIn: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: db, HttpError }))
vi.mock('../personActions', () => reach)
vi.mock('../appStart', () => start)
vi.mock('../siteAsk', () => ({ SiteSilent: class extends Error {}, SiteFailed: class extends Error {} }))
vi.mock('../words', () => ({
  NOTHING: 'Nothing was changed.',
  siteSilent: (s: string) => new HttpError(503, `${s} isn't answering HQ now. Try again once it is back. Nothing was changed.`),
}))

import { startableApps } from '../knownApps'
import { startLiveApp } from '../personApps'

const at = (iso: string) => new Date(iso)
const known = (over: Record<string, unknown>) => ({
  id: 'a', workspaceId: 'w1', branch: 'shop-1', name: 'shop', folder: '', command: 'npm run dev', port: 3000, state: 'stopped',
  livePreviewId: null, updatedAt: at('2026-11-01T00:00:00Z'), runs: [], ...over,
})
const MAIN = { id: 'lp-main', workspaceId: 'w1', branch: 'main', state: 'RUNNING' }

beforeEach(() => {
  vi.clearAllMocks()
  reach.reachLivePreview.mockResolvedValue({ row: MAIN, site: { siteId: 's1', name: 'Mac' }, canAct: true })
})

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

  it("prefers the branch's own record, and leaves out one already going here", async () => {
    const row = { id: 'lp1', workspaceId: 'w1', branch: 'shop-1' }
    db.liveApp.findMany.mockResolvedValue([
      known({ id: 'a2', branch: 'shop-2', runs: [{ startedAt: at('2026-11-01T12:00:00Z') }] }),
      known({ id: 'a1', branch: 'shop-1', command: 'npm start', runs: [{ startedAt: at('2026-11-01T10:00:00Z') }] }),
      known({ id: 'a3', branch: 'shop-1', name: 'api', state: 'running', livePreviewId: 'lp1' }),
    ])
    expect(await startableApps(row)).toEqual([{ name: 'shop', folder: '', command: 'npm start', port: 3000, fromBranch: null }])
  })
})

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
