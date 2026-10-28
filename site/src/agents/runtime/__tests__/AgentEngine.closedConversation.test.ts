/**
 * Person-scoped execution spec §4, adr-0076 and adr-0078, end to end through
 * the engine: a conversation whose harness state is gone is closed (never
 * restarted), a failure with the state present leaves it open, a closed
 * conversation never runs again, and a run uses the runtime its session was
 * created with rather than the agent's current one.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  resolveAgentContext: vi.fn(),
  prepareAgentContainer: vi.fn(),
  sdk: { sessionExists: vi.fn(), run: vi.fn() },
  native: { sessionExists: vi.fn(), run: vi.fn() },
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
    siteConfig: { findFirst: vi.fn() },
    hqConnection: { findFirst: vi.fn() },
  },
}))
const mockPrisma = h.mockPrisma
vi.mock('#db', () => ({ prisma: h.mockPrisma }))

vi.mock('../agentUtils', async () => {
  const actual = await vi.importActual<any>('../agentUtils')
  return { ...actual, resolveAgentContext: h.resolveAgentContext }
})
vi.mock('../../../server/storage/primaryLocationService', () => ({
  resolvePrimaryLocation: vi.fn(() => ({ ownerType: 'user', ownerId: 'u1' })),
  getLocationCwd: vi.fn().mockResolvedValue('/tmp/agenthix-test-cwd'),
}))
vi.mock('../../agentDiskPaths', () => ({
  getSiteRoot: vi.fn(() => '/site'),
  AGENT_CONTAINER_CLAUDE_HOME: '/home/appuser/.claude',
}))
vi.mock('../containerPrep', async () => ({
  ...(await vi.importActual<typeof import('../containerPrep')>('../containerPrep')),
  prepareAgentContainer: h.prepareAgentContainer,
}))
vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(() => ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
  })),
}))
vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
  (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
vi.mock('../../../server/identity/verifyHqToken', () => ({ verifyHqToken: vi.fn() }))
vi.mock('../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: vi.fn(() => null) }))
vi.mock('../SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: vi.fn() } }))
vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation((name: string) => (name === 'claude-sdk' ? h.sdk : h.native)),
}))
vi.mock('../../../packages/runPackages', () => ({
  resolveRunPackageDirs: vi.fn(async (refs: unknown) => ({
    refs, agentDir: '/cache/agent', orgDir: null, platformDir: '/cache/platform',
  })),
}))
vi.mock('../../promptContent', () => ({
  loadPromptContent: vi.fn(async () => ({ instructions: null, org: null })),
}))
vi.mock('../../../packages/boundaryOverrides', () => ({ resolveBoundaryOverrideDir: vi.fn(async () => null) }))

import { agentEngine } from '../AgentEngine'
import { selectRuntime } from '../selectRuntime'
import { siteStream } from '../SiteStreamEmitter'
import { verifyHqToken } from '../../../server/identity/verifyHqToken'

const AGENT = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'claude-sdk', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const SESSION = {
  id: 'sess-1', userId: 'u1', model: null, status: 'ACTIVE', closedReason: null, runtime: 'claude-sdk',
  primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}
const CONTEXT: RunContextPayload = {
  agent: AGENT as any,
  chat: { sessionContext: null },
  mounts: { ownerSlugs: {} },
  riskRules: null,
  credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' },
  packages: {
    agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
    org: null,
    platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
  },
}

function run(context: RunContextPayload = CONTEXT) {
  return agentEngine.run('run-1', {
    queued: false,
    capabilityJwt: 'capability-jwt', runLimits: DEFAULT_RUN_LIMITS,
    dispatchContext: context,
    chatContext: { sessionContext: null },
  })
}

function withSession(overrides: Record<string, unknown>, agent: Record<string, unknown> = AGENT) {
  h.resolveAgentContext.mockResolvedValue({ agent, session: { ...SESSION, ...overrides } })
}

function failedError(): string {
  const call = mockPrisma.agentRun.update.mock.calls
    .map(([arg]: any[]) => arg)
    .find((arg: any) => arg?.data?.status === 'FAILED')
  return call?.data?.error ?? ''
}

function terminalFrame(): any {
  return vi.mocked(siteStream.status).mock.calls.map(([f]) => f).find((f: any) => f.status !== 'RUNNING')
}

const closedWrites = () =>
  mockPrisma.agentSession.updateMany.mock.calls.filter(([arg]: any[]) => arg?.data?.status === 'CLOSED')

describe('closing a conversation whose harness state is gone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.agentSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.transcriptEntry.count.mockResolvedValue(3)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat' })
    h.prepareAgentContainer.mockResolvedValue(null)
    for (const rt of [h.sdk, h.native]) {
      rt.sessionExists.mockResolvedValue(true)
      rt.run.mockImplementation(async function* () { yield { type: 'status', status: 'completed' } })
    }
    withSession({})
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  it('closes the conversation and fails the run, rather than starting the harness afresh', async () => {
    h.sdk.sessionExists.mockResolvedValue(false)

    const outcome = await run()

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(h.sdk.run).not.toHaveBeenCalled()
    expect(closedWrites()).toEqual([[{ where: { id: 'sess-1' }, data: { status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' } }]])
    expect(failedError()).toContain("no longer has this conversation's context")
    expect(failedError()).toContain('Start a new conversation')
    expect(terminalFrame()).toMatchObject({
      status: 'FAILED',
      sessionPatch: { status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' },
    })
  })

  it('asks the harness about the session in the runner\'s home and the directory the run works in', async () => {
    await run()

    expect(h.sdk.sessionExists).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      harnessHomeDir: expect.stringMatching(/^\/site\/homes\//),
      workingDirectory: '/tmp/agenthix-test-cwd',
      containerName: null,
    })
  })

  it('leaves the conversation open when the run fails with its state present — an MCP server that would not start, say', async () => {
    h.sdk.run.mockImplementation(async function* () {
      yield { type: 'status', status: 'failed', error: 'Claude Code process exited with code 1' }
    })

    const outcome = await run()

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(closedWrites()).toEqual([])
    expect(terminalFrame().sessionPatch?.status).toBeUndefined()
  })

  it('does not ask about a conversation that has nothing to resume yet', async () => {
    mockPrisma.transcriptEntry.count.mockResolvedValue(0)

    await run()

    expect(h.sdk.sessionExists).not.toHaveBeenCalled()
    expect(h.sdk.run).toHaveBeenCalled()
  })

  it('never runs a conversation that is already closed', async () => {
    withSession({ status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' })

    const outcome = await run()

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(h.sdk.sessionExists).not.toHaveBeenCalled()
    expect(h.sdk.run).not.toHaveBeenCalled()
    expect(terminalFrame().sessionPatch).toMatchObject({ status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' })
  })

  it('fails without closing anything when the harness state cannot be read', async () => {
    h.sdk.sessionExists.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))

    const outcome = await run()

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(closedWrites()).toEqual([])
    expect(terminalFrame().sessionPatch?.status).toBeUndefined()
  })
})

describe('a conversation keeps the runtime it started with (adr-0078)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.transcriptEntry.count.mockResolvedValue(3)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat' })
    h.prepareAgentContainer.mockResolvedValue(null)
    for (const rt of [h.sdk, h.native]) {
      rt.sessionExists.mockResolvedValue(true)
      rt.run.mockImplementation(async function* () { yield { type: 'status', status: 'completed' } })
    }
  })

  it('resumes in the session\'s runtime after the agent moved to another one', async () => {
    const movedAgent = { ...AGENT, runtime: 'claude-sdk' }
    withSession({ runtime: 'opencode' }, movedAgent)

    const outcome = await run({ ...CONTEXT, agent: movedAgent as any, credential: null })

    expect(outcome).toEqual({ status: 'COMPLETED' })
    expect(selectRuntime).toHaveBeenLastCalledWith('opencode')
    expect(h.native.sessionExists).toHaveBeenCalled()
  })

  it('applies the credential gate of the session\'s runtime, not the agent\'s', async () => {
    const movedAgent = { ...AGENT, runtime: 'opencode' }
    withSession({ runtime: 'claude-sdk' }, movedAgent)

    const outcome = await run({ ...CONTEXT, agent: movedAgent as any, credential: null })

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(failedError()).toContain('No model credential is configured')
  })

  it('takes the agent\'s runtime for a session that recorded none', async () => {
    const nativeAgent = { ...AGENT, runtime: 'opencode' }
    withSession({ runtime: null }, nativeAgent)

    await run({ ...CONTEXT, agent: nativeAgent as any, credential: null })

    expect(selectRuntime).toHaveBeenLastCalledWith('opencode')
  })
})
