/**
 * What a storm from a screen may not do to hq or its sites (live preview phase 2's proof, Q2 and Q4): telling HQ a live
 * preview is in use counts at most once per person in 30 seconds, the site is asked whether Git is on once for many
 * reads at once, and a done task's run ending leaves the copy a live preview runs from.
 */
import { withFeature } from '@agenthix/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  livePreview: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  executionSite: { findUnique: vi.fn() },
  task: { findUnique: vi.fn() },
}))
vi.mock('wasp/server', () => ({ prisma: db, HttpError: class extends Error { constructor(readonly statusCode: number, m?: string) { super(m) } } }))
vi.mock('../../branches/workspaceAccess', () => ({ reachWorkspace: vi.fn(async () => ({ canAct: true })) }))
vi.mock('../socket', () => ({ emitLivePreviewChange: vi.fn(), emitLivePreviewReload: vi.fn(), emitLivePreviewAuto: vi.fn() }))
vi.mock('../../relays', () => ({
  appTickets: { revoke: vi.fn() }, livePreviewsHaveAnAddress: () => true, NO_PREVIEW_ADDRESS_MESSAGE: '',
  onAppsCutOff: vi.fn(), onBundleReport: vi.fn(), bundleRelayFor: vi.fn(), carryBundle: vi.fn(),
}))
const branchMocks = vi.hoisted(() => ({
  branchOfSession: vi.fn(), liveCopyOf: vi.fn(), removeCopiesOf: vi.fn(), livePreviewOnBranch: vi.fn(), retryRemovals: vi.fn(),
}))
vi.mock('../../branches/branchRows', () => ({ branchOfSession: branchMocks.branchOfSession, liveCopyOf: branchMocks.liveCopyOf }))
vi.mock('../../branches/copies', () => ({
  removeCopiesOf: branchMocks.removeCopiesOf, livePreviewOnBranch: branchMocks.livePreviewOnBranch, retryRemovals: branchMocks.retryRemovals,
}))
vi.mock('../../branches/workspaceEvents', () => ({ emitBranchChange: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onSiteEvent: vi.fn(), onRunStatus: vi.fn() }))

import { __resetInUseForTests, IN_USE_AT_MOST_MS, markLivePreviewInUse } from '../personActions'
import { gitOnShared, __resetGitOnForTests } from '../places'
import { branchRunChanged } from '../../branches/branchBack'

beforeEach(() => {
  vi.clearAllMocks()
  __resetInUseForTests()
  __resetGitOnForTests()
  db.livePreview.findUnique.mockResolvedValue({ id: 'lp1', workspaceId: 'w1', executionSiteId: 'es1', state: 'RUNNING' })
  db.executionSite.findUnique.mockResolvedValue({ siteId: 's1', label: 'box' })
  db.livePreview.updateMany.mockResolvedValue({ count: 1 })
})

withFeature('livePreview', () => {
describe('telling HQ a live preview is in use @SC-1699', () => {
  it('counts once per person and live preview in 30 seconds', async () => {
    for (let i = 0; i < 100; i++) await markLivePreviewInUse('u1', 'lp1', 1_000 + i)
    expect(db.livePreview.updateMany).toHaveBeenCalledTimes(1)
    expect(db.livePreview.findUnique).toHaveBeenCalledTimes(1)
    await markLivePreviewInUse('u2', 'lp1', 1_050)
    expect(db.livePreview.updateMany).toHaveBeenCalledTimes(2)
    await markLivePreviewInUse('u1', 'lp1', 1_000 + IN_USE_AT_MOST_MS)
    expect(db.livePreview.updateMany).toHaveBeenCalledTimes(3)
  })

  it('a person refused is refused again, never let off as a repeat', async () => {
    db.livePreview.findUnique.mockResolvedValue(null)
    await expect(markLivePreviewInUse('u1', 'lp1', 1_000)).rejects.toThrow()
    await expect(markLivePreviewInUse('u1', 'lp1', 1_001)).rejects.toThrow()
    expect(db.livePreview.findUnique).toHaveBeenCalledTimes(2)
  })
})
})

withFeature('livePreview', () => {
describe('whether Git is on @SC-1700', () => {
  it('is asked of the site once for many reads at once, and a yes is kept', async () => {
    const ask = vi.fn(async () => { await new Promise(r => setTimeout(r, 5)); return true })
    const answers = await Promise.all(Array.from({ length: 50 }, () => gitOnShared('w1', ask, 1_000)))
    expect(answers.every(Boolean)).toBe(true)
    expect(await gitOnShared('w1', ask, 30_000)).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('a no, or a failure, is asked again', async () => {
    const no = vi.fn(async () => false)
    await gitOnShared('w2', no, 1_000)
    await gitOnShared('w2', no, 1_001)
    expect(no).toHaveBeenCalledTimes(2)
    const fails = vi.fn(async () => { throw new Error('silent') })
    await expect(gitOnShared('w3', fails, 1_000)).rejects.toThrow('silent')
    await expect(gitOnShared('w3', fails, 1_001)).rejects.toThrow('silent')
    expect(fails).toHaveBeenCalledTimes(2)
  })
})
})

withFeature('livePreview', () => {
describe("a done task's run ending @SC-1695", () => {
  const branch = { id: 'b1', workspaceId: 'w1', name: 'add-banner', taskId: 't1', copies: [] }
  beforeEach(() => {
    branchMocks.branchOfSession.mockResolvedValue(branch)
    branchMocks.liveCopyOf.mockReturnValue({ siteId: 'es1' })
    db.executionSite.findUnique.mockResolvedValue({ siteId: 's1' })
    db.task.findUnique.mockResolvedValue({ status: 'DONE', archived: false })
  })

  it('leaves the copy a live preview runs from', async () => {
    branchMocks.livePreviewOnBranch.mockResolvedValue(true)
    await branchRunChanged({ sessionId: 'sess', status: 'COMPLETED' }, 's1')
    expect(branchMocks.removeCopiesOf).not.toHaveBeenCalled()
  })

  it('removes the copy when no live preview runs from it', async () => {
    branchMocks.livePreviewOnBranch.mockResolvedValue(false)
    await branchRunChanged({ sessionId: 'sess', status: 'COMPLETED' }, 's1')
    expect(branchMocks.removeCopiesOf).toHaveBeenCalledWith('b1')
  })
})
})
