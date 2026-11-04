/**
 * adr-0083, spec §3, through the engine: every turn tells the conversation's
 * lifecycle when it starts, where it launched and when it ended; a turn that
 * finds its conversation closed ends it, and a cancel stops only its own turn.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  lifecycle: {
    turnStarting: vi.fn(async (_id: string) => {}),
    turnLaunched: vi.fn(),
    turnEnded: vi.fn(async (_id: string, _options?: unknown) => {}),
  },
  order: [] as string[],
  resolveAgentContext: vi.fn(),
  prepareAgentContainer: vi.fn(),
  sdk: { sessionExists: vi.fn(), run: vi.fn() },
  native: { sessionExists: vi.fn(), run: vi.fn() },
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

vi.mock('../conversationLifecycle', () => ({ conversationLifecycle: h.lifecycle }))
const finder = vi.hoisted(() => ({ endConversationProcesses: vi.fn() }))
vi.mock('../conversationProcesses', () => finder)

import { agentEngine } from '../AgentEngine'
import { agentContainerManager } from '../AgentContainerManager'
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

function withSession(overrides: Record<string, unknown>) {
  h.resolveAgentContext.mockResolvedValue({ agent: AGENT, session: { ...SESSION, ...overrides } })
}

describe('a turn and its conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.order.length = 0
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.agentSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.transcriptEntry.count.mockResolvedValue(3)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat', runtime: 'claude-sdk' })
    h.prepareAgentContainer.mockResolvedValue({
      containerName: 'agenthix-agent-c1', primaryContainerPath: '/projects/p1', mounts: { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' },
    })
    for (const rt of [h.sdk, h.native]) {
      rt.sessionExists.mockResolvedValue(true)
      rt.run.mockImplementation(async function* () { h.order.push('harness'); yield { type: 'status', status: 'completed' } })
    }
    h.lifecycle.turnStarting.mockImplementation(async () => { h.order.push('starting') })
    h.lifecycle.turnEnded.mockImplementation(async () => { h.order.push('ended') })
    vi.spyOn(agentContainerManager, 'markRunStart').mockImplementation(() => {})
    vi.spyOn(agentContainerManager, 'markRunEnd').mockImplementation(() => { h.order.push('container-end') })
    withSession({})
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  it('starts the turn before the harness, records where it launched, and ends it before the container', async () => {
    await run()

    expect(h.order).toEqual(['starting', 'harness', 'ended', 'container-end'])
    expect(h.lifecycle.turnStarting).toHaveBeenCalledWith('sess-1')
    expect(h.lifecycle.turnLaunched).toHaveBeenCalledWith('sess-1', {
      containerName: 'agenthix-agent-c1', runtime: h.sdk, runStagingServerDir: expect.stringMatching(/^\/site\/run-staging\//),
    })
    expect(h.lifecycle.turnEnded).toHaveBeenCalledWith('sess-1', expect.objectContaining({ ended: false }))
  })

  it('ends the conversation when the turn finds it closed', async () => {
    h.sdk.sessionExists.mockResolvedValue(false)

    await run()

    expect(h.lifecycle.turnLaunched).not.toHaveBeenCalled()
    expect(h.lifecycle.turnEnded).toHaveBeenCalledWith('sess-1', {
      ended: true,
      fallback: { containerName: 'agenthix-agent-c1', runtimeName: 'claude-sdk', runStagingServerDir: expect.stringMatching(/^\/site\/run-staging\//) },
    })
  })

  it('ends the turn when the launch fails, so the conversation can still go idle', async () => {
    h.prepareAgentContainer.mockRejectedValue(new Error('docker is down'))

    await run()

    expect(h.lifecycle.turnStarting).toHaveBeenCalledTimes(1)
    expect(h.lifecycle.turnEnded).toHaveBeenCalledTimes(1)
  })
})

describe('a cancelled turn', () => {
  it('stops only its own turn: no finder and no conversation release', async () => {
    vi.clearAllMocks()
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 1 })

    await agentEngine.cancelRun('run-9')

    expect(finder.endConversationProcesses).not.toHaveBeenCalled()
    expect(h.lifecycle.turnEnded).not.toHaveBeenCalled()
  })
})
