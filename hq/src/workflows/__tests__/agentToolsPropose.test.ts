/** propose_workflow reads the definition from the workspace the agent names, like run_workflow (walkthrough finding 30). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))
vi.mock('../../sessions/siteRuntimeStore', () => ({
  getRun: vi.fn(async () => ({ id: 'run-1', sessionId: 's1', taskId: 't1', status: 'RUNNING' })),
}))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: vi.fn(async () => 'u1') }))
vi.mock('../library', () => ({}))
vi.mock('../propose', () => ({ proposeWorkflowVersion: vi.fn(async () => ({ version: 1, flags: [] })) }))
vi.mock('../runs', () => ({ startWorkflowRun: vi.fn() }))
vi.mock('../runsEvents', () => ({ refreshRunFromSite: vi.fn() }))
vi.mock('../runsLive', () => ({ waitForRunEnd: vi.fn() }))
vi.mock('../runsView', () => ({}))
vi.mock('../placeAccess', () => ({ mayStartRunsInPlace: vi.fn(async () => true) }))
vi.mock('../runWorkspace', () => ({
  chooseRunWorkspace: vi.fn(async (run: object, named?: string) => (named === 'demo' ? { ...run, workspaceId: 'ws-demo' } : run)),
}))

import { proposeWorkflowVersion } from '../propose'
import { proposeWorkflowOp } from '../agentTools'

const ctx = { kind: 'run', claims: { siteId: 'site-1', sessionId: 's1', taskId: 't1', projectId: 'p1', userId: 'u1', workspaceId: null, agentId: 'a1' } } as any

describe('propose_workflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the definition from the workspace named, one of the place\'s own', async () => {
    await proposeWorkflowOp(ctx, { path: '.workflows/check-token/workflow.yaml', workspace: 'demo', runId: 'run-1' })
    expect(proposeWorkflowVersion).toHaveBeenCalledWith(expect.objectContaining({
      path: '.workflows/check-token/workflow.yaml',
      workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws-demo' },
    }))
  })
})
