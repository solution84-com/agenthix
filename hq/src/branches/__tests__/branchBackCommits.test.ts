/**
 * Every commit that comes back to a branch tells the workspace's room `commits`, which reloads a live preview with Auto
 * on (W14 of the live preview walk): the run-end commit and the sweep's too, not only the agent's own `commit`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, emit } = vi.hoisted(() => ({
  db: { branchCopy: { findUnique: vi.fn() }, workspaceBranch: { update: vi.fn() } },
  emit: vi.fn(),
}))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../workspaceEvents', () => ({ emitBranchChange: emit }))
vi.mock('../copies', () => ({ livePreviewOnBranch: vi.fn(), removeCopiesOf: vi.fn(), retryRemovals: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn(), onSiteEvent: vi.fn() }))

import { handleBranchBack } from '../branchBack'

const BRANCH = { id: 'b-1', workspaceId: 'w1', ownerType: 'project', ownerId: 'p1', name: 'add-banner' }
const frame = (cause: string, moved = true) => ({
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  copyId: '00000000-0000-4000-8000-000000000001',
  branch: 'add-banner',
  cause,
  back: { head: 'a'.repeat(40), previous: null, moved, backup: null },
  runId: 'r1',
})

beforeEach(() => {
  vi.clearAllMocks()
  db.branchCopy.findUnique.mockResolvedValue({ branch: BRANCH, site: { siteId: 'site-1' } })
})

describe('commits coming back to a branch', () => {
  it.each(['run_end', 'sweep'])('tell the room commits on %s', async cause => {
    await handleBranchBack('site-1', frame(cause))
    expect(emit).toHaveBeenCalledWith(BRANCH, 'commits')
  })

  it('tell nothing when the branch did not move', async () => {
    await handleBranchBack('site-1', frame('run_end', false))
    expect(emit).not.toHaveBeenCalled()
  })
})
