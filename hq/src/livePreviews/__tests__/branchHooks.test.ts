/**
 * What `main` moving and a merge do to live previews (live preview spec sections 4 and 5): `main`'s live preview, and
 * each live preview's own copy on another site, are brought to `main`'s new tip; a merge first brings back the commits
 * a live preview on another site holds, or is refused in words.
 */
import { withFeature } from '@agenthix/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  livePreview: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  executionSite: { findUnique: vi.fn() },
}))
vi.mock('wasp/server', () => ({ prisma: db, HttpError: class extends Error { constructor(readonly statusCode: number, m?: string) { super(m) } } }))
const m = vi.hoisted(() => ({
  locateWorkspace: vi.fn(), siteCall: vi.fn(), askSite: vi.fn(), carryBundle: vi.fn(), dropBundle: vi.fn(), bringBack: vi.fn(),
}))
vi.mock('../../branches/workspaceLocation', () => ({ locateWorkspace: m.locateWorkspace }))
vi.mock('../../branches/siteCalls', () => ({ siteCall: m.siteCall }))
vi.mock('../../storage/workspaceStore', () => ({ deleteWorkspaceAt: vi.fn() }))
vi.mock('../siteAsk', () => ({ askSite: m.askSite }))
vi.mock('../bundles', () => ({ carryBundle: m.carryBundle, dropBundle: m.dropBundle }))
vi.mock('../back', () => ({ bringBack: m.bringBack }))
vi.mock('../stopping', () => ({ stopAs: vi.fn() }))
vi.mock('../store', () => ({ LIVE: ['STARTING', 'RUNNING', 'PAUSED'], livePreviewOn: vi.fn() }))

import { bringBackBeforeMerge, mainMoved } from '../branchHooks'

const NEW_MAIN = 'f'.repeat(40)
const ref = { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }
const sites: Record<string, { siteId: string; label: string }> = {
  home: { siteId: 'site-home', label: 'office' },
  lab: { siteId: 'site-lab', label: 'lab' },
}

function row(over: Record<string, unknown>) {
  return {
    id: 'lp', workspaceId: 'w1', executionSiteId: 'home', copyKind: 'MAIN', onMain: true, branch: 'main', branchId: null,
    userId: 'u1', state: 'RUNNING', headCommit: 'a'.repeat(40), ...over,
  }
}

const refreshes = () => m.askSite.mock.calls.filter(c => c[1] === 'livePreview.refresh')

beforeEach(() => {
  vi.clearAllMocks()
  m.locateWorkspace.mockResolvedValue({ ref, name: 'shop-app', logicalSiteId: 'site-home', executionSiteId: 'home' })
  m.siteCall.mockResolvedValue({ main: { name: 'main', head: NEW_MAIN, versions: 3 }, branches: [], overflow: false })
  db.executionSite.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sites[where.id] ?? null)
  db.livePreview.updateMany.mockResolvedValue({ count: 1 })
  m.askSite.mockResolvedValue({ ok: true, head: NEW_MAIN })
  m.carryBundle.mockResolvedValue({ carried: true, bundleId: 'bundle-1', head: NEW_MAIN })
})

withFeature('livePreview', () => {
describe('main moving @SC-1718', () => {
  it("brings main's live preview on the workspace's site to main's new tip, and keeps that tip", async () => {
    db.livePreview.findMany.mockResolvedValue([row({ id: 'lp-main' })])
    await mainMoved('w1')
    expect(db.livePreview.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: 'w1', state: { in: ['RUNNING', 'PAUSED'] } })
    expect(m.carryBundle).not.toHaveBeenCalled()
    expect(refreshes()).toEqual([['site-home', 'livePreview.refresh', { livePreviewId: 'lp-main', head: NEW_MAIN, bundleId: null }]])
    expect(db.livePreview.updateMany).toHaveBeenCalledWith({ where: { id: 'lp-main', state: { in: ['STARTING', 'RUNNING', 'PAUSED'] } }, data: { headCommit: NEW_MAIN } })
  })

  it("sends main to a branch's live preview on another site, so its own copy carries the new main, and keeps the branch's tip", async () => {
    db.livePreview.findMany.mockResolvedValue([row({ id: 'lp-b', executionSiteId: 'lab', copyKind: 'BUNDLE', onMain: false, branch: 'login', branchId: 'b1' })])
    await mainMoved('w1')
    expect(m.carryBundle).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'main', workspace: ref }, direction: 'toPreview',
      from: expect.objectContaining({ siteId: 'site-home' }), to: expect.objectContaining({ siteId: 'site-lab' }),
    }))
    expect(refreshes()).toEqual([['site-lab', 'livePreview.refresh', { livePreviewId: 'lp-b', head: NEW_MAIN, bundleId: 'bundle-1' }]])
    expect(m.dropBundle).toHaveBeenCalledWith('site-lab', 'bundle-1')
    expect(db.livePreview.updateMany).not.toHaveBeenCalled()
  })

  it('asks no site anything when no live preview of the workspace runs', async () => {
    db.livePreview.findMany.mockResolvedValue([])
    await mainMoved('w1')
    expect(m.siteCall).not.toHaveBeenCalled()
    expect(m.askSite).not.toHaveBeenCalled()
  })

  it('still brings the others up when one site fails, and keeps no tip the site did not answer', async () => {
    db.livePreview.findMany.mockResolvedValue([
      row({ id: 'lp-b', executionSiteId: 'lab', copyKind: 'BUNDLE', onMain: false, branch: 'login', branchId: 'b1' }),
      row({ id: 'lp-main' }),
    ])
    m.askSite.mockImplementation(async (siteId: string) => {
      if (siteId === 'site-lab') throw new Error('silent')
      return { ok: true, head: NEW_MAIN }
    })
    await mainMoved('w1')
    expect(refreshes().map(c => c[2].livePreviewId)).toEqual(['lp-b', 'lp-main'])
    expect(m.dropBundle).toHaveBeenCalledWith('site-lab', 'bundle-1')
    expect(db.livePreview.updateMany).toHaveBeenCalledTimes(1)
  })

  it("keeps main's old tip when the site refuses the refresh", async () => {
    db.livePreview.findMany.mockResolvedValue([row({ id: 'lp-main' })])
    m.askSite.mockResolvedValue({ ok: false, refusal: { code: 'notFound' } })
    await mainMoved('w1')
    expect(db.livePreview.updateMany).not.toHaveBeenCalled()
  })
})
})

withFeature('livePreview', () => {
describe('a merge of a branch whose live preview runs on another site @SC-1718', () => {
  it('brings its commits back first', async () => {
    db.livePreview.findFirst.mockResolvedValue(row({ id: 'lp-b', executionSiteId: 'lab', copyKind: 'BUNDLE', onMain: false, branch: 'login', branchId: 'b1' }))
    m.bringBack.mockResolvedValue(undefined)
    await bringBackBeforeMerge('b1')
    expect(db.livePreview.findFirst).toHaveBeenCalledWith({ where: { branchId: 'b1', copyKind: 'BUNDLE', state: { in: ['STARTING', 'RUNNING', 'PAUSED'] } } })
    expect(m.bringBack).toHaveBeenCalledWith('lp-b')
  })

  it('is refused in words when they cannot come back, and nothing is changed', async () => {
    db.livePreview.findFirst.mockResolvedValue(row({ id: 'lp-b', executionSiteId: 'lab', copyKind: 'BUNDLE', onMain: false, branch: 'login', branchId: 'b1' }))
    m.bringBack.mockRejectedValue(new Error('relay down'))
    const refused = bringBackBeforeMerge('b1')
    await expect(refused).rejects.toMatchObject({ statusCode: 503 })
    await expect(refused).rejects.toThrow(/login's live preview runs on another site.*Nothing was changed\./)
  })

  it('brings nothing back for a branch whose live preview is on its own site, or that has none', async () => {
    db.livePreview.findFirst.mockResolvedValue(null)
    await bringBackBeforeMerge('b1')
    expect(m.bringBack).not.toHaveBeenCalled()
  })
})
})
