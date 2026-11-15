/**
 * Ruling P9: a run whose package content is not in the site's cache fails with
 * `package_unavailable` before anything runs, and never runs any other content.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  capturedContext: null as any,
  midRunHolder: undefined as any,
  resolveAgentContext: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), findUnique: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
    siteConfig: { findFirst: vi.fn() },
    hqConnection: { findFirst: vi.fn() },
  },
  CAPABILITY_JWT: 'capability-jwt-should-never-reach-the-container',
}))
const mockPrisma = h.mockPrisma
const CAPABILITY_JWT = h.CAPABILITY_JWT
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

vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(function () { return ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
  }) }),
}))

vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
  (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
vi.mock('../../../server/identity/verifyHqToken', () => ({
  verifyHqToken: vi.fn().mockResolvedValue({
    sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
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

// Runtime selection is mocked: every run gets the stand-in below, and
// ClaudeSDKRuntime is a safe stand-in too.
vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run(context: any) {
      h.capturedContext = context
      // Resolve the bearer THE RUNTIME WAS HANDED, from inside the run — this is
      // the point at which a real container would present it to the MCP handler.
      const bearer = context.mcpServers?.platform?.headers?.Authorization?.replace('Bearer ', '')
      h.midRunHolder = bearer ? resolveRunToken(bearer) : null
      yield { type: 'status', status: 'completed' }
    },
  }) }),
}))
vi.mock('../ClaudeSDKRuntime', () => ({
  ClaudeSDKRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run(context: any) {
      h.capturedContext = context
      yield { type: 'status', status: 'completed' }
    },
  }) }),
}))

const packagesMock = vi.hoisted(() => ({ resolveRunPackageDirs: vi.fn() }))
vi.mock('../../../packages/runPackages', () => packagesMock)
vi.mock('../../promptContent', () => ({ loadPromptContent: vi.fn(async () => ({ instructions: null, org: null })) }))

import { agentEngine } from '../AgentEngine'
import { resolveRunToken } from '../../../server/runtime/runTokens'
import { PackageUnavailableError } from '../../../packages/packageCache'
import { selectRuntime } from '../selectRuntime'
import { siteStream } from '../SiteStreamEmitter'
import { verifyHqToken } from '../../../server/identity/verifyHqToken'

function mockAgentRun(overrides: Record<string, unknown> = {}) {
  mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  mockPrisma.agentRun.update.mockResolvedValue(undefined)
}

const AGENT_FIXTURE = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'opencode', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}
const DISPATCH_CONTEXT: RunContextPayload = {
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

const REFS = {
  agent: { kind: 'agent' as const, key: 'agent-1', digest: 'a'.repeat(64) },
  org: null,
  platform: { kind: 'platform' as const, key: 'platform', digest: 'b'.repeat(64) },
}

describe('a run whose package is not cached', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAgentRun()
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    packagesMock.resolveRunPackageDirs.mockRejectedValue(new PackageUnavailableError(REFS.agent))
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  it('fails with package_unavailable and never starts a runtime', async () => {
    const outcome = await agentEngine.run('run-1', {
      queued: false,
      capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS,
      dispatchContext: { ...DISPATCH_CONTEXT, packages: REFS },
      chatContext: { sessionContext: null },
    })
    expect(outcome).toEqual({ status: 'FAILED' })
    expect(mockPrisma.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', error: expect.stringMatching(/^package_unavailable: the agent package agent-1 \(content aaaaaaaaaaaa\)/) }),
    }))
    expect(selectRuntime).not.toHaveBeenCalled()
    expect(siteStream.status).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', error: expect.stringMatching(/^package_unavailable/) }))
  })
})
