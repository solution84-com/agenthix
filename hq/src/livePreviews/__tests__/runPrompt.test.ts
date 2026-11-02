/** What a run's prompt is told of its branch's live preview (W12 of the live preview walk). */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, on } = vi.hoisted(() => ({
  db: { executionSite: { findUnique: vi.fn() }, liveApp: { findMany: vi.fn() } },
  on: vi.fn(),
}))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../store', () => ({ livePreviewOn: on }))

import { livePreviewForPrompt } from '../runPrompt'

beforeEach(() => {
  vi.clearAllMocks()
  on.mockResolvedValue({ id: 'lp-1', executionSiteId: 'es-1', state: 'RUNNING' })
  db.executionSite.findUnique.mockResolvedValue({ siteId: 'site-1' })
  db.liveApp.findMany.mockResolvedValue([{ name: 'shop' }])
})

describe('the live preview a run is told of', () => {
  it('is the branch\'s, open on the run\'s site, with the apps that run in it', async () => {
    await expect(livePreviewForPrompt('ws-1', 'b-1', 'site-1')).resolves.toEqual({ paused: false, runningApps: ['shop'] })
    expect(on).toHaveBeenCalledWith(db, { workspaceId: 'ws-1', branchId: 'b-1' })
    expect(db.liveApp.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { livePreviewId: 'lp-1', state: { in: ['starting', 'running'] } } }))
  })

  it('says when it is paused', async () => {
    on.mockResolvedValue({ id: 'lp-1', executionSiteId: 'es-1', state: 'PAUSED' })
    await expect(livePreviewForPrompt('ws-1', 'b-1', 'site-1')).resolves.toMatchObject({ paused: true })
  })

  it('is none when the branch has none open', async () => {
    on.mockResolvedValue(null)
    await expect(livePreviewForPrompt('ws-1', 'b-1', 'site-1')).resolves.toBeNull()
  })

  it('is none when it runs on another site than the run', async () => {
    db.executionSite.findUnique.mockResolvedValue({ siteId: 'site-2' })
    await expect(livePreviewForPrompt('ws-1', 'b-1', 'site-1')).resolves.toBeNull()
  })
})
