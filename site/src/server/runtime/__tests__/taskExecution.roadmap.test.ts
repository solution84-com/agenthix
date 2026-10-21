/**
 * A task run's roadmap path is the site's to derive: hq names no
 * path on a site's disk, so `run.dispatch` carries none, and the task context
 * the engine builds the prompt from gets the path this site mounts the
 * project's files at. Goes through the real dispatch validator and the real
 * `runTask`; only prisma, the engine and the stream emitter are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAgentRunCreate = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: { agentRun: { create: mockAgentRunCreate, findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } },
}))

const mockEngineRun = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/AgentEngine', () => ({ agentEngine: { run: mockEngineRun } }))
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: vi.fn() } }))

import path from 'node:path'
import { runTask } from '../taskExecution'
import { runDispatchParams } from '../dispatchParams'

const TASK = {
  taskId: 'task-1', taskKey: 'WEB-42', title: 'Ship it', description: 'Do the thing.',
  projectId: 'proj-uuid', projectName: 'Web App', projectSlug: 'web-app', boardName: 'Main', columns: '- todo',
}

function dispatch(task: Record<string, unknown>) {
  return {
    kind: 'task',
    startedBy: 'person',
    capabilityJwt: 'jwt',
    session: {
      id: 'sess-1', sessionKey: 'task:agent-1', agentId: 'agent-1', userId: 'admin-1', sessionType: 'task',
      taskId: 'task-1', title: null, model: null, metadata: {},
      primaryOwnerType: 'project', primaryOwnerId: 'proj-uuid', primaryWorkspaceId: null, runtime: 'claude-sdk',
      createdAt: '2026-09-27T00:00:00.000Z',
    },
    inputText: 'Execute your assigned task.',
    model: 'claude-sonnet-4-6',
    hideUserMessage: true,
    runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
    context: {
      agent: {
        id: 'agent-1', name: 'Ada', handle: 'ada', role: null, runtime: 'claude-sdk', approval: 'bypassed',
        defaultModel: 'claude-sonnet-4-6', allowedTools: null, allowedBashPatterns: null, isKernel: false,
      },
      task,
      mounts: { ownerSlugs: { 'proj-uuid': 'web-app' } },
      riskRules: null,
      credential: null,
      packages: {
        agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
        org: null,
        platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
      },
    },
  }
}

async function roadmapPathFor(task: Record<string, unknown>): Promise<string> {
  const parsed = runDispatchParams.parse(dispatch(task))
  await runTask(parsed as Parameters<typeof runTask>[0])
  const [, options] = mockEngineRun.mock.calls[0] as [string, { taskContext: { roadmapPath: string } }]
  return options.taskContext.roadmapPath
}

const saved = { root: process.env.SITE_ROOT, isolation: process.env.AGENT_CONTAINER_ISOLATION }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ROOT = '/srv/site'
  mockAgentRunCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'run-1', ...data }))
  mockEngineRun.mockResolvedValue(undefined)
})
afterEach(() => {
  if (saved.root === undefined) delete process.env.SITE_ROOT; else process.env.SITE_ROOT = saved.root
  if (saved.isolation === undefined) delete process.env.AGENT_CONTAINER_ISOLATION
  else process.env.AGENT_CONTAINER_ISOLATION = saved.isolation
})

describe('a task run\'s roadmap path is derived by the site', () => {
  it('under container isolation, is the project files mount the run sees', async () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(await roadmapPathFor(TASK)).toBe('/projects/proj-uuid/files/ROADMAP.md')
  })

  it('without container isolation, is the project files directory on this site\'s disk', async () => {
    delete process.env.AGENT_CONTAINER_ISOLATION
    expect(await roadmapPathFor(TASK)).toBe(path.join('/srv/site', 'projects', 'proj-uuid', 'files', 'ROADMAP.md'))
  })

  it('ignores a roadmap path in what hq sends', async () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    const roadmap = await roadmapPathFor({ ...TASK, roadmapPath: '/hq/cwd/site/projects/proj-uuid/files/ROADMAP.md' })
    expect(roadmap).toBe('/projects/proj-uuid/files/ROADMAP.md')
  })
})
