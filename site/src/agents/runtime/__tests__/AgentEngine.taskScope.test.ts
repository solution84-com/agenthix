/**
 * Severed from hq's version (phase 5d-2 — AgentEngine.ts:173's
 * severance): the original regression pinned that a chat/voice turn into a
 * task session (AgentRun.taskId null, but the SESSION is task-scoped) still
 * MINTED its capability with the session's real taskId/projectId, so the
 * mint side and the mount side could never disagree about task scope.
 *
 * That reconciliation (deriving projectId from a task id that may live on
 * the run row OR the session row) is hq's job now — it happens once, at
 * dispatch time, building RunContextPayload.task before the run ever reaches
 * site (capability mint moved to hq entirely; site only verifies the JWT hq
 * hands over). What's left for THIS file to pin is site's half of the same
 * invariant in its new shape: AgentEngine must take `ctx.task.projectId`
 * from the dispatch context as the authority and never re-derive project
 * scope from AgentRun.taskId itself — regardless of whether the run row
 * happens to carry a taskId or not.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  capturedContext: null as any,
  resolveAgentContext: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), findUnique: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
  },
}))
vi.mock('#db', () => ({ prisma: h.mockPrisma }))

vi.mock('../agentUtils', async () => {
  const actual = await vi.importActual<any>('../agentUtils')
  return { ...actual, resolveAgentContext: h.resolveAgentContext }
})

// The owner-shaped mount set (resolveAccessibleLocations) is covered by
// AgentEngine.resolveLocations.test.ts — resolvePrimaryLocation is stubbed here
// to a fixed task location since this file only asserts on RunContext.projectId.
vi.mock('../../../server/storage/primaryLocationService', () => ({
  resolvePrimaryLocation: vi.fn(() => ({ ownerType: 'project', ownerId: 'p1', taskId: 't1' })),
  getLocationCwd: vi.fn().mockResolvedValue('/tmp/agenthix-test-cwd'),
}))

vi.mock('../../agentDiskPaths', () => ({
  getSiteRoot: vi.fn(() => '/site'),
  AGENT_CONTAINER_CLAUDE_HOME: '/home/appuser/.claude',
}))

// The site now creates the agent's workspace directory itself at launch
// (hq no longer provisions a site's disk) — mkdir is mocked so this doesn't
// touch the real filesystem.
vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(function () { return ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
  }) }),
}))

// Spread the real module so exports added later (Task 12's runPackageColumns) stay real.
vi.mock('../../../packages/runPackages', async () => ({
  ...(await vi.importActual<typeof import('../../../packages/runPackages')>('../../../packages/runPackages')),
  resolveRunPackageDirs: vi.fn(async (refs: unknown) => ({ refs, agentDir: '/cache/agent', orgDir: null, platformDir: '/cache/platform' })),
}))
vi.mock('../../promptContent', () => ({ loadPromptContent: vi.fn(async () => ({ instructions: null, org: null })) }))

vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
  (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
vi.mock('../../../server/identity/verifyHqToken', () => ({
  verifyHqToken: vi.fn().mockResolvedValue({
    sessionId: 'sess-1', agentId: 'agent-1', projectId: 'p1', taskId: 't1', siteId: 'site-1',
    userId: 'u1', workspaceId: null, role: null,
    permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    exp: Math.floor(Date.now() / 1000) + 900,
  }),
}))

vi.mock('../../../server/siteConfig', () => ({
  getAgentFacingSiteUrl: vi.fn(() => 'http://localhost:4201'),
}))

vi.mock('../SiteStreamEmitter', () => ({
  siteStream: { stream: vi.fn(), status: vi.fn() },
}))

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run(context: any) {
      h.capturedContext = context
      yield { type: 'status', status: 'completed' }
    },
  }) }),
}))
vi.mock('../ClaudeSDKRuntime', () => ({
  ClaudeSDKRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run(_context: any) {
      yield { type: 'status', status: 'completed' }
    },
  }) }),
}))

import { agentEngine } from '../AgentEngine'

function mockAgentRun(overrides: Record<string, unknown> = {}) {
  h.mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  h.mockPrisma.agentRun.update.mockResolvedValue(undefined)
}

const AGENT_FIXTURE = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'opencode', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
// Task session shape (ADR-0039 §10): primaryOwnerType 'project' + taskId set.
// Reached via the chat page or the voice socket — not only via TaskRunner.
const TASK_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null,
  taskId: 't1', sessionType: 'task',
}
const CHAT_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}
const TASK_DISPATCH_CONTEXT: RunContextPayload = {
  agent: AGENT_FIXTURE as any,
  task: {
    taskId: 't1', taskKey: 'WEB-1', title: 'Title', description: 'Desc',
    projectId: 'p1', projectName: 'Project', projectSlug: 'project', boardName: 'Board',
    columns: 'columns',
  },
  mounts: { ownerSlugs: { p1: 'project' } },
  riskRules: null,
  credential: null,
  packages: {
    agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
    org: null,
    platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
  },
}
const CHAT_DISPATCH_CONTEXT: RunContextPayload = {
  agent: AGENT_FIXTURE as any,
  chat: { sessionContext: null },
  mounts: { ownerSlugs: {} },
  riskRules: null,
  credential: null,
  packages: {
    agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
    org: null,
    platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
  },
}

describe('AgentEngine — RunContext.projectId is taken from the dispatch context, never re-derived from AgentRun.taskId @SC-301', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.capturedContext = null
    delete process.env.AGENT_CONTAINER_ISOLATION
    h.mockPrisma.toolCallLog.findMany.mockResolvedValue([])
  })

  it('a chat/voice turn into a task session gets projectId from ctx.task, even though its AgentRun row carries no taskId', async () => {
    // ChatRunner-equivalent dispatch creates AgentRun rows with no taskId
    // regardless of the session — this is the exact shape it produces for a
    // turn into a task session.
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: TASK_DISPATCH_CONTEXT, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.capturedContext.projectId).toBe('p1')
  })

  it('a genuine task run (AgentRun.taskId already set) still resolves the same projectId', async () => {
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
    mockAgentRun({ taskId: 't1' })

    await agentEngine.run('run-1', { dispatchContext: TASK_DISPATCH_CONTEXT, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.capturedContext.projectId).toBe('p1')
  })

  it('a chat run into a conversational (non-task) session resolves projectId null — unaffected by the fix', async () => {
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_SESSION_FIXTURE })
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: CHAT_DISPATCH_CONTEXT, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.capturedContext.projectId).toBeNull()
  })
})
