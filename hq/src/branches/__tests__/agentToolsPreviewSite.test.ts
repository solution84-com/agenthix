/**
 * `commit` in a run on another site, in its branch's live preview's own copy: it works when the workspace's site no
 * longer holds a copy of the branch (a done task's copy is removed), and refuses a run on no branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ branch: null as null | Record<string, unknown>, askedSite: [] as { siteId: string; method: string }[] }))

vi.mock('wasp/server', () => ({ prisma: { executionSite: { findUnique: vi.fn(async () => ({ siteId: 'home-site' })) } } }))
vi.mock('../../sessions/siteRuntimeStore', () => ({
  getRun: vi.fn(async () => ({ sessionId: 's1', taskId: 't1', status: 'RUNNING' })),
}))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: vi.fn(async () => 'u1') }))
vi.mock('../branchRows', async () => {
  const actual = await vi.importActual<typeof import('../branchRows')>('../branchRows')
  return { ...actual, branchOfSession: vi.fn(async () => state.branch) }
})
vi.mock('../workspaceLocation', () => ({ locateWorkspace: vi.fn(async () => ({ logicalSiteId: 'home-site' })) }))
vi.mock('../gitPeople', () => ({
  gitPersonForAgent: vi.fn(async () => ({ name: 'Kernel', email: 'kernel@agents.hq.invalid' })),
  gitPersonForUser: vi.fn(async () => ({ name: 'Mia', email: 'mia@people.hq.invalid' })),
}))
vi.mock('../../livePreviews/runs', () => ({
  livePreviewOfSession: vi.fn(async () => ({ row: { id: 'lp1', copyId: 'c-preview', copyKind: 'BUNDLE', state: 'RUNNING' }, logicalSiteId: 'preview-site' })),
  runsGoToPreviewSite: (lp: { row: { copyKind: string; state: string } } | null) => !!lp && lp.row.copyKind === 'BUNDLE' && lp.row.state === 'RUNNING',
}))
vi.mock('../../livePreviews/back', () => ({ bringBack: vi.fn(async () => undefined) }))
vi.mock('../../livePreviews/siteAsk', () => ({
  askSite: vi.fn(async (siteId: string, method: string) => {
    state.askedSite.push({ siteId, method })
    return { ok: true, result: { committed: true, commit: 'a'.repeat(40), files: 1 } }
  }),
}))

import { LIVE_PREVIEW_METHODS } from '@agenthix/core'
import { commitOp } from '../agentTools'
import type { CallerContext } from '../../server/controlplane/types'

const ctx = { kind: 'run', claims: { siteId: 'preview-site', sessionId: 's1', taskId: 't1', agentId: 'a1' } } as unknown as CallerContext
const branch = (copies: unknown[]) => ({ id: 'b1', name: 'add-contact-line', workspaceId: 'w1', ownerType: 'project', ownerId: 'p1', copies })

beforeEach(() => { state.askedSite.length = 0 })

describe('commit in a run on its live preview\'s site @SC-1671', () => {
  it('commits in the live preview\'s copy when the workspace\'s site holds no copy of the branch', async () => {
    state.branch = branch([])
    const result = await commitOp(ctx, { message: 'Change the contact line', runId: 'r1' })
    expect(result).toMatchObject({ committed: true, branch: 'add-contact-line' })
    expect(state.askedSite).toEqual([{ siteId: 'preview-site', method: LIVE_PREVIEW_METHODS.commit }])
  })

  it('refuses a run on no branch', async () => {
    state.branch = null
    await expect(commitOp(ctx, { message: 'x', runId: 'r1' })).rejects.toMatchObject({ code: 'invalid' })
  })
})
