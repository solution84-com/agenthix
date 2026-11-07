/**
 * A conversation's run and a workspace's branches (owner decision, area 7): any conversation's worker in a workspace
 * its lead's brief named works on that conversation's own branch there, one per conversation and workspace, whether
 * or not the conversation was started anywhere near the workspace. A worker given no workspace makes no branch, and a
 * person who may only read the workspace's project gets none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => ({ standing: 'works' as 'works' | 'reads' | 'none' }))
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } },
  prisma: {
    conversation: { findUnique: vi.fn(async () => ({ title: 'Launch checklist' })) },
    task: { findUnique: vi.fn(async () => null) },
  },
}))
vi.mock('../../projects/membership', () => ({ projectStanding: vi.fn(async () => rows.standing) }))
const prepare = vi.hoisted(() => vi.fn(async () => ({ codeWork: {}, branchId: 'b1', release: () => {} })))
vi.mock('../codeWorkDispatch', () => ({ prepareCodeWork: prepare }))
vi.mock('../whose', () => ({ firstAsk: vi.fn(async () => 'hello') }))

import { codeWorkForRun } from '../runCodeWork'

const ask = (primaryWorkspaceId: string | null, over: { title?: string | null; owner?: { ownerType: 'project' | 'user'; ownerId: string } } = {}) => ({
  session: { taskId: null, conversationId: 'c1', primaryWorkspaceId, title: 'title' in over ? over.title : 'Build the login page' },
  primaryLoc: over.owner ?? { ownerType: 'project' as const, ownerId: 'p1' },
  personId: 'u1', agentId: 'a1', runSiteId: 's',
})

beforeEach(() => { prepare.mockClear(); rows.standing = 'works' })

describe("a conversation's run and a workspace's branches", () => {
  it("an ordinary project conversation's worker in a workspace works on the conversation's own branch there", async () => {
    expect(await codeWorkForRun(ask('w1'))).not.toBeNull()
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      work: { conversationId: 'c1' }, workspaceId: 'w1', owner: { type: 'project', id: 'p1' }, nameFrom: 'Build the login page',
    }))
  })

  it('keys the branch by conversation and workspace: a second workspace is a second branch', async () => {
    await codeWorkForRun(ask('w1'))
    await codeWorkForRun(ask('w2'))
    expect(prepare.mock.calls.map(c => (c as unknown as [{ workspaceId: string }])[0].workspaceId)).toEqual(['w1', 'w2'])
  })

  it('names a branch from what the person first asked when the work has no title', async () => {
    await codeWorkForRun(ask('w1', { title: null }))
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ nameFrom: 'hello' }))
  })

  it('in Your space, works on a branch for its own person', async () => {
    expect(await codeWorkForRun(ask('w1', { owner: { ownerType: 'user', ownerId: 'u1' } }))).not.toBeNull()
  })

  it('a worker given no workspace makes no branch', async () => {
    expect(await codeWorkForRun(ask(null))).toBeNull()
    expect(prepare).not.toHaveBeenCalled()
  })

  it("a Viewer's conversation never gets a branch, nor one in someone else's space", async () => {
    rows.standing = 'reads'
    await expect(codeWorkForRun(ask('w1'))).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/Nothing was changed\.$/) })
    rows.standing = 'none'
    await expect(codeWorkForRun(ask('w1'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(codeWorkForRun(ask('w1', { owner: { ownerType: 'user', ownerId: 'someone-else' } }))).rejects.toMatchObject({ statusCode: 403 })
    expect(prepare).not.toHaveBeenCalled()
  })
})
