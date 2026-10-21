/**
 * A task run is given the comments written since its agent's last run on the
 * task (every-screen-reviewed spec §9, "The agent reads the comments"): hq sends
 * the newest comments, and the site keeps those newer than that run, which only
 * it knows. Goes through the real dispatch validator and the real `runTask`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ runCreate: vi.fn(), runFindFirst: vi.fn(), engineRun: vi.fn() }))
vi.mock('#db', () => ({ prisma: { agentRun: { create: h.runCreate, findFirst: h.runFindFirst, updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } }))
vi.mock('../../../agents/runtime/AgentEngine', () => ({ agentEngine: { run: h.engineRun } }))
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: vi.fn() } }))

import { runTask } from '../taskExecution'
import { runDispatchParams } from '../dispatchParams'

const COMMENTS = [
  { author: 'ana', at: '2026-10-06T09:00:00.000Z', text: 'Old direction.' },
  { author: '@reviewer', at: '2026-10-07T08:00:00.000Z', text: 'Found a bug in step 2.' },
  { author: 'ben', at: '2026-10-07T09:00:00.000Z', text: 'Use the staging bucket.' },
]

function dispatch(extra: Record<string, unknown> = {}) {
  return {
    kind: 'task',
    startedBy: 'person',
    capabilityJwt: 'jwt',
    session: {
      id: 'sess-1', sessionKey: 'task:agent-1', agentId: 'agent-1', userId: 'admin-1', sessionType: 'task',
      taskId: 'task-1', title: null, model: null, metadata: {},
      primaryOwnerType: 'project', primaryOwnerId: 'proj-1', primaryWorkspaceId: null, runtime: 'claude-sdk',
      createdAt: '2026-09-27T00:00:00.000Z',
    },
    inputText: 'Execute your assigned task.',
    model: 'claude-sonnet-4-6',
    hideUserMessage: false,
    runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
    context: {
      agent: {
        id: 'agent-1', name: 'Ada', handle: 'ada', role: null, runtime: 'claude-sdk', approval: 'bypassed',
        defaultModel: 'claude-sonnet-4-6', allowedTools: null, allowedBashPatterns: null, isKernel: false,
      },
      task: {
        taskId: 'task-1', taskKey: 'WEB-1', title: 'Ship it', description: 'Do it.', projectId: 'proj-1',
        projectName: 'Web', projectSlug: 'web', boardName: 'Main', columns: '- todo', comments: COMMENTS,
      },
      mounts: { ownerSlugs: { 'proj-1': 'web' } },
      riskRules: null,
      credential: null,
      packages: {
        agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
        org: null,
        platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
      },
    },
    ...extra,
  }
}

async function run(extra: Record<string, unknown> = {}) {
  await runTask(runDispatchParams.parse(dispatch(extra)) as Parameters<typeof runTask>[0])
  const [, options] = h.engineRun.mock.calls[0] as [string, { taskContext: { newComments?: unknown } }]
  return options.taskContext
}

beforeEach(() => {
  vi.clearAllMocks()
  h.runCreate.mockResolvedValue({ id: 'run-2' })
  h.engineRun.mockResolvedValue({ status: 'COMPLETED' })
})

describe('a task run is given the comments new since its agent last ran on the task @SC-522 @SC-520 @SC-773', () => {
  it('keeps only those written after that run started', async () => {
    h.runFindFirst.mockResolvedValue({ createdAt: new Date('2026-10-07T07:00:00.000Z') })
    const taskContext = await run()
    expect(taskContext.newComments).toEqual(COMMENTS.slice(1))
    expect(h.runFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 'task-1', agentId: 'agent-1' },
      orderBy: { createdAt: 'desc' },
    }))
  })

  it('gives every comment hq sent to an agent that has not run on the task', async () => {
    h.runFindFirst.mockResolvedValue(null)
    expect((await run()).newComments).toEqual(COMMENTS)
  })

  it('records on the run the person it is on behalf of', async () => {
    h.runFindFirst.mockResolvedValue(null)
    await run({ onBehalfOfUserId: 'u-ben' })
    expect(h.runCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ dispatch: expect.objectContaining({ onBehalfOfUserId: 'u-ben' }) }),
      }),
    })
  })
})
