/**
 * In the demo a Claude SDK run with no credential still launches, because no model is called; and the launch
 * never prepares a container, even with isolation on.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  resolveAgentContext: vi.fn(),
  prepareAgentContainer: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), findUnique: vi.fn() },
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

const locationMock = vi.hoisted(() => ({
  resolvePrimaryLocation: vi.fn(() => ({ ownerType: 'user', ownerId: 'u1' })),
  getLocationCwd: vi.fn().mockResolvedValue('/tmp/agenthix-test-cwd'),
}))
vi.mock('../../../server/storage/primaryLocationService', () => locationMock)

vi.mock('../../agentDiskPaths', () => ({
  getSiteRoot: vi.fn(() => '/site'),
  AGENT_CONTAINER_CLAUDE_HOME: '/home/appuser/.claude',
}))

// Spread the real module: `resolveContainerKey` beside it decides which
// Claude home the run gets, and the launch needs the real answer even when the
// container itself is stubbed out.
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
  selectRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run() {
      yield { type: 'status', status: 'completed' }
    },
  })),
}))

const packagesMock = vi.hoisted(() => ({
  resolveRunPackageDirs: vi.fn(async (refs: unknown) => ({
    refs, agentDir: '/cache/agent', orgDir: null, platformDir: '/cache/platform',
  })),
}))
vi.mock('../../../packages/runPackages', () => packagesMock)
vi.mock('../../promptContent', () => ({
  loadPromptContent: vi.fn(async () => ({ instructions: null, org: null })),
}))
vi.mock('../../../packages/boundaryOverrides', () => ({ resolveBoundaryOverrideDir: vi.fn(async () => null) }))

import { agentEngine } from '../AgentEngine'
import { selectRuntime } from '../selectRuntime'
import { siteStream } from '../SiteStreamEmitter'
import { verifyHqToken } from '../../../server/identity/verifyHqToken'

const SDK_AGENT = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'claude-sdk', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}
const CONTEXT: RunContextPayload = {
  agent: SDK_AGENT as any,
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

function run(context: RunContextPayload) {
  return agentEngine.run('run-1', {
    queued: false,
    capabilityJwt: 'capability-jwt', runLimits: DEFAULT_RUN_LIMITS,
    dispatchContext: context,
    chatContext: { sessionContext: null },
  })
}

function failedError(): string {
  const call = mockPrisma.agentRun.update.mock.calls
    .map(([arg]: any[]) => arg)
    .find((arg: any) => arg?.data?.status === 'FAILED')
  return call?.data?.error ?? ''
}


describe('a run in the demo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('DEMO_MODE', 'true')
    vi.stubEnv('AGENT_CONTAINER_ISOLATION', 'true')
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.transcriptEntry.count.mockResolvedValue(0)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat' })
    h.resolveAgentContext.mockResolvedValue({ agent: SDK_AGENT, session: SESSION_FIXTURE })
    h.prepareAgentContainer.mockResolvedValue({ containerName: 'must-not-be-used', mounts: { folders: [] }, primaryContainerPath: '/x' })
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'user', ownerId: 'u1' })
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('launches with no credential and prepares no container @SC-1990', async () => {
    const outcome = await run(CONTEXT)
    expect(outcome).toMatchObject({ status: 'COMPLETED' })
    expect(h.prepareAgentContainer).not.toHaveBeenCalled()
    expect(selectRuntime).toHaveBeenCalled()
  })

  it('still fails a credential-less run with the setting off @SC-1992', async () => {
    vi.unstubAllEnvs()
    const outcome = await run(CONTEXT)
    expect(outcome).toEqual({ status: 'FAILED' })
    expect(selectRuntime).not.toHaveBeenCalled()
  })
})
