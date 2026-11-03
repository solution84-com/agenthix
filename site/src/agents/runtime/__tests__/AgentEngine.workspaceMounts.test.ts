/**
 * From a phase 5c review: AgentEngine's workspace-store read
 * inside prepareAgentContainer — the owner's workspace listing
 * (listWorkspacesByOwner), which ADR-0057 made the single read behind both the
 * mount set and the primary workspace's slug — must fail closed. A run must
 * never mount a deleted workspace's path (a primary workspace missing from its
 * own owner's listing throws) or start with an incomplete mount set silently
 * missing an unreachable site's workspaces (any store error propagates out of
 * prepareAgentContainer and fails the run).
 *
 * Modeled on AgentEngine.taskScope.test.ts's scaffold — the lightest seam that
 * still runs prepareAgentContainer for real is AgentEngine.run() end to end
 * with AGENT_CONTAINER_ISOLATION enabled.
 *
 * Severed from hq's version (phase 5d-2): the workspace-store reads no
 * longer cross hq's `storage/workspaceStore` channel indirection — they're
 * direct reads against site's own Workspace table (server/storage/workspaceRows.ts),
 * mocked below the same way. Membership queries (ProductMember/ProjectMember)
 * and the primary owner's slug (project/product/program tables) are gone
 * entirely — site has no delegate for any of them (SC-338) — replaced by the
 * dispatch context's pre-resolved `ctx.mounts`. `db` is gone; site's own
 * `prisma` is mocked directly with the four runtime-model delegate names.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

// assembleRunLaunch (runLaunch.ts) is real in this file — only AgentContainerManager
// is mocked below. Mocked here so these tests never touch the real filesystem,
// and so the mkdir assertions below can see every directory a run asks for.
vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    // No workspace here is a Git repository (codeWorkspaceMounts.ts looks for a `.git`).
    lstat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  },
}))

const h = vi.hoisted(() => ({
  resolveAgentContext: vi.fn(),
  verifyHqToken: vi.fn(),
  storeListWorkspacesByOwner: vi.fn(),
  ensureRunning: vi.fn(),
  stopAgent: vi.fn(),
  callHqData: vi.fn(),
  // Captured by the NativeRuntime and AgentPromptBuilder mocks below, so tests
  // can inspect exactly what the engine handed the run and the prompt builder.
  lastRunContext: null as any,
  lastPromptArg: null as any,
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

vi.mock('../../../server/storage/workspaceRows', () => ({
  listWorkspacesByOwner: h.storeListWorkspacesByOwner,
}))

vi.mock('../../../server/hq/dataClient', () => ({
  callHqData: h.callHqData,
}))

vi.mock('../AgentContainerManager', () => ({
  agentContainerManager: {
    ensureRunning: h.ensureRunning,
    stopAgent: h.stopAgent,
    markRunStart: vi.fn(),
    markRunEnd: vi.fn(),
  },
}))

vi.mock('../../agentDiskPaths', () => ({
  getSiteRoot: vi.fn(() => '/site'),
  AGENT_CONTAINER_CLAUDE_HOME: '/home/appuser/.claude',
}))

vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(() => ({
    buildChatPrompt: vi.fn((arg: any) => { h.lastPromptArg = arg; return Promise.resolve({ systemPrompt: 'system prompt' }) }),
    buildTaskPrompt: vi.fn((arg: any) => { h.lastPromptArg = arg; return Promise.resolve({ systemPrompt: 'system prompt' }) }),
  })),
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
  verifyHqToken: h.verifyHqToken,
}))

vi.mock('../../../server/siteConfig', () => ({
  getAgentFacingSiteUrl: vi.fn(() => 'http://localhost:4201'),
}))

vi.mock('../SiteStreamEmitter', () => ({
  siteStream: { stream: vi.fn(), status: vi.fn() },
}))

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run(context: any) {
      h.lastRunContext = context
      yield { type: 'status', status: 'completed' }
    },
  })),
}))
vi.mock('../ClaudeSDKRuntime', () => ({
  ClaudeSDKRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run(_context: any) {
      yield { type: 'status', status: 'completed' }
    },
  })),
}))

// resolvePrimaryLocation is mocked per-test below via a settable ref, since
// each test needs a different primary location shape.
const primaryLocRef: { current: any } = { current: null }
vi.mock('../../../server/storage/primaryLocationService', () => ({
  resolvePrimaryLocation: vi.fn(() => primaryLocRef.current),
  getLocationCwd: vi.fn().mockResolvedValue('/tmp/agenthix-test-cwd'),
}))

import fs from 'node:fs/promises'
import { getLocationCwd } from '../../../server/storage/primaryLocationService'
import { agentEngine } from '../AgentEngine'

const mockFs = vi.mocked(fs)

function mockAgentRun(overrides: Record<string, unknown> = {}) {
  h.mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  h.mockPrisma.agentRun.update.mockResolvedValue(undefined)
}

// runtime: 'opencode' + AGENT_CONTAINER_ISOLATION=true (set by several describe blocks'
// beforeEach below) is a test seam, not a supported production pairing — container
// isolation is exercised here purely to drive AgentEngine's container-prep and mount
// logic without pulling in ClaudeSDKRuntime's SDK dependencies.
const AGENT_FIXTURE = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'opencode', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const CHAT_WORKSPACE_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: 'ws-missing',
  taskId: null, sessionType: 'chat',
}
const TASK_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null,
  taskId: 't1', sessionType: 'task',
}
// No workspaceId → no primary workspace slug to resolve, and 'user' owner slug
// resolution needs no DB call — keeps these invoker-mapping fixtures simple to satisfy.
const CHAT_NO_WORKSPACE_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}
function chatDispatchContext(overrides: Partial<RunContextPayload> = {}): RunContextPayload {
  return {
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
    ...overrides,
  }
}
function taskDispatchContext(overrides: Partial<RunContextPayload> = {}): RunContextPayload {
  return {
    agent: AGENT_FIXTURE as any,
    task: {
      taskId: 't1', taskKey: 'WEB-42', title: 'Title', description: 'Desc',
      projectId: 'p1', projectName: 'Project', projectSlug: 'web', boardName: 'Board',
      columns: 'columns',
    },
    mounts: { ownerSlugs: { p1: 'web' } },
    riskRules: null,
    credential: null,
    packages: {
      agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
    },
    ...overrides,
  }
}

const DEFAULT_CLAIMS = {
  sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
  userId: 'u1', workspaceId: null, role: null,
  permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  exp: Math.floor(Date.now() / 1000) + 900,
}

describe('AgentEngine — container mounts fail closed on the store @SC-322', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    h.mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    // ADR-0057: the mount set is the owner's whole storage, so EVERY run reads
    // the owner's workspaces — not only a task run. Default to none; tests that
    // care set their own.
    h.storeListWorkspacesByOwner.mockResolvedValue([])
    h.ensureRunning.mockResolvedValue('agenthix-test-agent')
    h.stopAgent.mockResolvedValue({ allRemoved: true })
    h.verifyHqToken.mockResolvedValue(DEFAULT_CLAIMS)
    // No session row unless a test supplies one (clearAllMocks keeps a value set earlier).
    h.mockPrisma.agentSession.findUnique.mockResolvedValue(null)
    h.callHqData.mockResolvedValue(undefined)
  })

  it('a run whose session row could not be read prepares no container at all', async () => {
    // The real `resolveAgentContext`, not the stub the rest of this file uses:
    // this is the gate itself, driven with the null the engine threads down
    // when it cannot read the row. It sits before `prepareAgentContainer`, so a
    // run that is placed on a key of its own — and therefore describes no
    // boundary — can never reach a boundary's container. TypeScript already
    // holds the ordering (the container needs fields only the non-null session
    // has); this guards a rewrite that reintroduces a read or a default.
    const actual = await vi.importActual<typeof import('../agentUtils')>('../agentUtils')
    h.resolveAgentContext.mockImplementation(actual.resolveAgentContext)
    h.mockPrisma.agentSession.findUnique.mockResolvedValue(null)
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.ensureRunning).not.toHaveBeenCalled()
    expect(h.mockPrisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'FAILED', error: 'Session not found' }),
      }),
    )
  })

  it('a deleted primary workspace (absent from its owner\'s listing) fails the run rather than mounting the raw id', async () => {
    primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: 'ws-missing', taskId: null }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_WORKSPACE_SESSION_FIXTURE })
    h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws-other', name: 'Still here' }])
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.ensureRunning).not.toHaveBeenCalled()
    expect(h.mockPrisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('no longer exists') }),
      }),
    )
  })

  it('a chat run reads its own owner\'s workspaces too — the set is the owner\'s, not the run\'s', async () => {
    primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
    h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws9', name: 'Notes' }])
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.storeListWorkspacesByOwner).toHaveBeenCalledWith({ ownerType: 'user', ownerId: 'u1', select: 'names' })
    const mounts = h.ensureRunning.mock.calls[0][2]
    expect(mounts.folders.map((l: any) => l.containerDir)).toContain('/users/u1/workspaces/ws9')
  })

  it("binds the owner's whole folder once, so a workspace hq never listed is inside it too (ADR-0079)", async () => {
    primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
    h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws9', name: 'Notes' }, { id: 'ws-new', name: 'Fresh' }])
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    const mounts = h.ensureRunning.mock.calls[0][2]
    expect(mounts.boundary).toEqual({ hostDir: '/site/users/u1', containerDir: '/users/u1' })
    expect(mounts.folders.map((l: any) => l.containerDir)).toEqual(expect.arrayContaining(['/users/u1/workspaces/ws9', '/users/u1/workspaces/ws-new']))
  })

  it('nothing refuses a run for a "blocked" workspace any more — the capability carries no such claim', async () => {
    primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: 'ws9', taskId: null }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: { ...CHAT_NO_WORKSPACE_SESSION_FIXTURE, primaryWorkspaceId: 'ws9' } })
    h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws9', name: 'Notes' }])
    // What a pre-ADR-0079 hq would have sent; the site no longer reads it.
    h.verifyHqToken.mockResolvedValue({ ...DEFAULT_CLAIMS, workspaceId: 'ws9', workspaceBlocked: true, blockedWorkspaceIds: ['ws9'] })
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.ensureRunning).toHaveBeenCalled()
    expect(h.lastRunContext.cwd).toBe('/users/u1/workspaces/ws9')
    expect(h.mockPrisma.agentRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('a task run reads listWorkspacesByOwner for the project owner with the "names" select — a site-local read, no siteId needed', async () => {
    primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', taskId: 't1' }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
    h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws1', name: 'web' }])
    mockAgentRun({ taskId: 't1' })

    await agentEngine.run('run-1', { dispatchContext: taskDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.storeListWorkspacesByOwner).toHaveBeenCalledWith({ ownerType: 'project', ownerId: 'p1', select: 'names' })
    expect(h.ensureRunning).toHaveBeenCalled()
    expect(h.mockPrisma.agentRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('a store failure listing project workspaces propagates out of prepareAgentContainer and fails the run', async () => {
    primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', taskId: 't1' }
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
    h.storeListWorkspacesByOwner.mockRejectedValue(new Error('Execution Site "Box One" is unreachable'))
    mockAgentRun({ taskId: 't1' })

    await agentEngine.run('run-1', { dispatchContext: taskDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.ensureRunning).not.toHaveBeenCalled()
    expect(h.mockPrisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('unreachable') }),
      }),
    )
  })

  describe('boundary-keyed container wiring @SC-325', () => {
    it('ensureRunning is keyed by the storage location and the mode, and a task session yields invokerUserId: null', async () => {
      primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', taskId: 't1' }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
      h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws1', name: 'web' }])
      mockAgentRun({ taskId: 't1' })

      // The session row the launch reads, so the runner on the key is the one
      // the real check derives from it — the project, for a task.
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(TASK_SESSION_FIXTURE)

      await agentEngine.run('run-1', { dispatchContext: taskDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      expect(h.ensureRunning).toHaveBeenCalledWith(
        { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } },
        expect.objectContaining({
          handle: AGENT_FIXTURE.handle,
          sessionId: TASK_SESSION_FIXTURE.id,
          invokerUserId: null,
          taskId: 't1',
        }),
        expect.anything(),
      )
    })

    it('a chat session passes invokerUserId = session.userId, and keys on that person\'s own storage', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(CHAT_NO_WORKSPACE_SESSION_FIXTURE)
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      expect(h.ensureRunning).toHaveBeenCalledWith(
        { scope: 'storage', ownerType: 'user', ownerId: 'u1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } },
        expect.objectContaining({
          handle: AGENT_FIXTURE.handle,
          sessionId: CHAT_NO_WORKSPACE_SESSION_FIXTURE.id,
          invokerUserId: CHAT_NO_WORKSPACE_SESSION_FIXTURE.userId,
        }),
        expect.anything(),
      )
    })

    it('a chat turn and a task run in one project mount the same set, in different containers (ADR-0074)', async () => {
      // Two real runs of different kinds, each resolving its own mounts through
      // the real containerPrep, compared on what they hand the container
      // manager. The boundary and the mount set are the owner's, so they are
      // equal; the runner is not — the chat runs for the person, the task for
      // the project — so they are two containers with two harness homes.
      h.storeListWorkspacesByOwner.mockResolvedValue([{ id: 'ws1', name: 'web' }])
      const ownerSlugs = { mounts: { ownerSlugs: { p1: 'web' } } }
      const chatInProject = { ...CHAT_NO_WORKSPACE_SESSION_FIXTURE, primaryOwnerType: 'project', primaryOwnerId: 'p1' }

      primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: chatInProject })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(chatInProject)
      mockAgentRun({ taskId: null })
      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(ownerSlugs), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', taskId: 't1' }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(TASK_SESSION_FIXTURE)
      mockAgentRun({ id: 'run-2', taskId: 't1' })
      await agentEngine.run('run-2', { dispatchContext: taskDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      const [chatKey, chatCtx, chatMounts] = h.ensureRunning.mock.calls[0]
      const [taskKey, taskCtx, taskMounts] = h.ensureRunning.mock.calls[1]
      expect(chatKey).toEqual({ scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } })
      expect(taskKey).toEqual({ ...chatKey, runner: { kind: 'project', projectId: 'p1' } })
      expect(taskMounts).toEqual(chatMounts)
      // The tasks root is in the set for BOTH — it is the owner's, not the run's.
      expect(chatMounts.folders.map((l: any) => l.containerDir)).toContain('/projects/p1/tasks')
      // …and these really were two different run shapes, not the same one twice.
      expect(chatCtx.taskId).toBeNull()
      expect(taskCtx.taskId).toBe('t1')
      // Only the cwd differs, and it is a path inside the shared set.
      expect(h.lastPromptArg.containerMounts.primaryContainerPath).toBe('/projects/p1/tasks/t1')
    })

    it('two sessions of one person in one boundary hand ensureRunning the same key', async () => {
      const first = { ...CHAT_NO_WORKSPACE_SESSION_FIXTURE, primaryOwnerType: 'project', primaryOwnerId: 'p1' }
      const second = { ...first, id: 'sess-2' }
      primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: first })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(first)
      mockAgentRun({ taskId: null })
      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext({ mounts: { ownerSlugs: { p1: 'web' } } }), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: second })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(second)
      mockAgentRun({ id: 'run-2', sessionId: 'sess-2', taskId: null })
      await agentEngine.run('run-2', { dispatchContext: chatDispatchContext({ mounts: { ownerSlugs: { p1: 'web' } } }), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      expect(h.ensureRunning.mock.calls[0][0]).toEqual({
        scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'person', userId: 'u1' },
      })
      expect(h.ensureRunning.mock.calls[0][0]).toEqual(h.ensureRunning.mock.calls[1][0])
      expect(h.ensureRunning.mock.calls[0][1].sessionId).not.toBe(h.ensureRunning.mock.calls[1][1].sessionId)
    })

    it('two members chatting in one project get two keys, one per person, over the same mount set', async () => {
      const alice = { ...CHAT_NO_WORKSPACE_SESSION_FIXTURE, userId: 'u-alice', primaryOwnerType: 'project', primaryOwnerId: 'p1' }
      const bob = { ...alice, id: 'sess-2', userId: 'u-bob' }
      primaryLocRef.current = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
      const dispatch = chatDispatchContext({ mounts: { ownerSlugs: { p1: 'web' } } })

      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: alice })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(alice)
      h.verifyHqToken.mockResolvedValue({ ...DEFAULT_CLAIMS, userId: 'u-alice' })
      mockAgentRun({ taskId: null })
      await agentEngine.run('run-1', { dispatchContext: dispatch, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: bob })
      h.mockPrisma.agentSession.findUnique.mockResolvedValue(bob)
      h.verifyHqToken.mockResolvedValue({ ...DEFAULT_CLAIMS, sessionId: 'sess-2', userId: 'u-bob' })
      mockAgentRun({ id: 'run-2', sessionId: 'sess-2', taskId: null })
      await agentEngine.run('run-2', { dispatchContext: dispatch, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      const [aliceKey, , aliceMounts] = h.ensureRunning.mock.calls[0]
      const [bobKey, , bobMounts] = h.ensureRunning.mock.calls[1]
      expect(aliceKey.runner).toEqual({ kind: 'person', userId: 'u-alice' })
      expect(bobKey.runner).toEqual({ kind: 'person', userId: 'u-bob' })
      expect(bobMounts).toEqual(aliceMounts)
    })
  })

  // Phase 6: the agent's own working directory is gone. A run reaches its storage
  // boundary and nothing else, and carries no path of the agent's own.
  describe('a run reaches its boundary and nothing else', () => {
    // The run's boundary directory is what the native runtime's file tools work
    // in. It is the server's view of the location, never the container-side cwd.
    it('RunContext.workingTreeDir is the location the run works in, not the container path', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      expect(h.lastRunContext.workingTreeDir).toBe(await getLocationCwd(primaryLocRef.current))
      expect(h.lastRunContext.workingTreeDir).not.toBe(h.lastRunContext.cwd)
      expect(h.lastRunContext.workingTreeDir).not.toContain('/agents/')
    })

    it('gives a run a cwd inside its own boundary and no workspace of its own', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      // Where it works is a path inside the boundary's own mount set, and the
      // server-side view of it is that boundary's directory.
      const mounts = h.ensureRunning.mock.calls[0][2]
      expect(mounts.folders.map((l: any) => l.containerDir)).toContain(h.lastRunContext.cwd)
      expect(h.lastRunContext.workingTreeDir).toBe(await getLocationCwd(primaryLocRef.current))

      // And the run carries no directory of the agent's own, in either view.
      expect(h.lastRunContext.agent).not.toHaveProperty('workspaceDir')
      expect(h.lastRunContext.agent).not.toHaveProperty('workspaceServerDir')
      // The engine creates nothing on disk for this run at all — its pre-run
      // mkdir of the agent's own directory was the only thing it ever made
      // here.
      expect(mockFs.mkdir).not.toHaveBeenCalled()
      // ensureRunning is handed the boundary, the run's context and the mount
      // set, and nothing else: the two workspace arguments are gone.
      expect(h.ensureRunning.mock.calls[0]).toHaveLength(3)
    })

    it('no container-mode mount destination or prompt line contains the site root', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      // getSiteRoot() is mocked to '/site' in this file — assert it appears nowhere
      // the containerized run or its prompt would see a path.
      const containerDirs = (h.lastPromptArg.containerMounts?.locations ?? []).map((l: any) => l.containerDir)
      for (const dir of containerDirs) expect(dir).not.toContain('/site')
      expect(h.lastPromptArg.containerMounts?.primaryContainerPath).not.toContain('/site')
    })
  })

  // ADR-0058: the per-person mount is gone. hq holds what an agent knows about
  // a person and sends it in the run's context; nothing is bound into the
  // container for it, on any kind of run.
  describe('memory is never mounted', () => {
    it('a personal chat run computes no memory mount at all', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      const mounts = h.ensureRunning.mock.calls[0][2]
      expect(mounts).not.toHaveProperty('memory')
      // Narrower than a bare '/users/' substring: a personal chat run legitimately
      // mounts the invoker's own files location at a host path that also contains
      // '/users/<id>/files' (locationResolver.ts's 'personal' convention) — this
      // checks for the deleted per-agent partition's own shape specifically.
      expect(JSON.stringify(mounts)).not.toContain(`/agents/${AGENT_FIXTURE.handle}/users/`)
      expect(h.lastPromptArg.containerMounts).not.toHaveProperty('hasMemory')
    })

    it('a chat turn inside a task session still labels its invoker — that predicate is untouched', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({
        agent: AGENT_FIXTURE,
        session: { ...CHAT_NO_WORKSPACE_SESSION_FIXTURE, taskId: 't1' },
      })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      expect(h.ensureRunning.mock.calls[0][2]).not.toHaveProperty('memory')
      expect(h.ensureRunning.mock.calls[0][1]).toEqual(expect.objectContaining({ invokerUserId: 'u1' }))
    })

    it('the prompt is handed no memory: memory is recalled through HQ, not sent with the run', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
      expect(h.lastPromptArg).not.toHaveProperty('memory')
    })
  })

  // Phase 5d-1 (spec §6.4): AgentMounts.locationMode is decided from the
  // VERIFIED capability's permissions — extracted before prepareAgentContainer is
  // called (moved up in AgentEngine.processRun) so the mount decision and the
  // RunContext's own allowedTools/neverTools always agree, never independently
  // re-derived.
  describe('locationMode wiring @SC-334 @SC-335', () => {
    it('a capability whose effective set has no write tools yields locationMode ro', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      h.verifyHqToken.mockResolvedValue({
        ...DEFAULT_CLAIMS,
        permissions: {
          bypassed: false,
          allowedTools: [{ name: 'read_file', state: 'always' }],
          allowedBashPatterns: [],
          neverTools: [],
        },
      })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      const mounts = h.ensureRunning.mock.calls[0][2]
      expect(mounts.locationMode).toBe('ro')
    })

    it('a write-capable capability yields locationMode rw', async () => {
      primaryLocRef.current = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
      h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: CHAT_NO_WORKSPACE_SESSION_FIXTURE })
      h.verifyHqToken.mockResolvedValue({
        ...DEFAULT_CLAIMS,
        permissions: {
          bypassed: false,
          allowedTools: [{ name: 'write_file', state: 'always' }],
          allowedBashPatterns: [],
          neverTools: [],
        },
      })
      mockAgentRun({ taskId: null })

      await agentEngine.run('run-1', { dispatchContext: chatDispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

      const mounts = h.ensureRunning.mock.calls[0][2]
      expect(mounts.locationMode).toBe('rw')
    })
  })
})
