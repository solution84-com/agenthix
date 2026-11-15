/**
 * Spec §6.3: a subscription hq granted is counted into its login's copies on the site for the run's length, so a
 * token the harness refreshes is reported back against the grant (subscriptionLogins.ts), and the document leaves
 * the run's home when the run ends. This file pins which runs join and that the document goes; what joining and
 * leaving do is covered in subscriptionLogins.test.ts.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  resolveAgentContext: vi.fn(),
  prepareAgentContainer: vi.fn(),
  clearRunCredential: vi.fn(async (_home: string) => {}),
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

// Spread the real module: `resolveContainerKey` beside it decides which Claude
// home the run gets, and the launch needs the real answer even when the
// container itself is stubbed out.
vi.mock('../containerPrep', async () => ({
  ...(await vi.importActual<typeof import('../containerPrep')>('../containerPrep')),
  prepareAgentContainer: h.prepareAgentContainer,
}))

vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

// The removal itself is covered where it lives. What this file pins is that a run reaches it at all.
vi.mock('../boundaryClaudeHome', async () => ({
  ...(await vi.importActual<typeof import('../boundaryClaudeHome')>('../boundaryClaudeHome')),
  clearRunCredential: h.clearRunCredential,
}))

// Spied, not replaced: what joining and leaving do is covered in
// subscriptionLogins.test.ts. This file pins which runs join at all.
const logins = vi.hoisted(() => ({ join: vi.fn(), leave: vi.fn() }))
vi.mock('../subscriptionLogins', async () => {
  const actual = await vi.importActual<typeof import('../subscriptionLogins')>('../subscriptionLogins')
  logins.join.mockImplementation(actual.joinSubscriptionLogin)
  logins.leave.mockImplementation(actual.leaveSubscriptionLogin)
  return { ...actual, joinSubscriptionLogin: logins.join, leaveSubscriptionLogin: logins.leave }
})

vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(function () { return ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
  }) }),
}))

vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
  (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
vi.mock('../../../server/identity/verifyHqToken', () => ({ verifyHqToken: vi.fn() }))
vi.mock('../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: vi.fn(() => null) }))
vi.mock('../SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: vi.fn() } }))

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run() { yield { type: 'status', status: 'completed' } },
  }) }),
}))
vi.mock('../ClaudeSDKRuntime', () => ({
  ClaudeSDKRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run() { yield { type: 'status', status: 'completed' } },
  }) }),
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
import { verifyHqToken } from '../../../server/identity/verifyHqToken'

const AGENT = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'claude-sdk', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const CHAT_SESSION = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null,
  taskId: null, sessionType: 'chat',
}

const ADAS_DOCUMENT = JSON.stringify({ claudeAiOauth: { accessToken: 'ada-token', expiresAt: 5_000 } })
const SUBSCRIPTION = {
  kind: 'subscription' as const, provider: 'anthropic' as const, oauthJson: ADAS_DOCUMENT, grantId: 'grant-1', loginId: 'login-1',
}

const CONTEXT: RunContextPayload = {
  agent: AGENT as any,
  chat: { sessionContext: null },
  mounts: { ownerSlugs: {} },
  riskRules: null,
  credential: SUBSCRIPTION,
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

describe('the document leaves the home with the run @SC-782', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SITE_ROOT = '/site'
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.transcriptEntry.count.mockResolvedValue(0)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat' })
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT, session: CHAT_SESSION })
    h.prepareAgentContainer.mockResolvedValue(null)
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'user', ownerId: 'u1' })
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  /**
   * The document does not survive the run it was granted to. The home outlives
   * the run and is bound read-write into every later run in the same boundary,
   * so leaving it there is a credential outliving the authority that granted
   * it — hq can revoke a subscription and the disk would not follow.
   */
  it('takes the document back out of the home when the run ends', async () => {
    await run(CONTEXT)

    expect(h.clearRunCredential).toHaveBeenCalledWith('/site/homes/users/u1/personal/.claude')
  })

  it('removes the document even for a run given none', async () => {
    // An API-key run was granted no document, but the home may still hold one
    // an earlier run left — the removal is about the home, not about this
    // run's own credential.
    await run({ ...CONTEXT, credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' } })

    expect(h.clearRunCredential).toHaveBeenCalledWith('/site/homes/users/u1/personal/.claude')
  })
})

describe('a subscription hq granted @SC-1231', () => {
  const GRANTED = SUBSCRIPTION

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SITE_ROOT = '/site'
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.transcriptEntry.count.mockResolvedValue(0)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A task' })
    h.prepareAgentContainer.mockResolvedValue(null)
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: 'p1', taskId: 'task-1', siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  it("joins a project task's run to its login's copies, and counts it out when the run ends", async () => {
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'project', ownerId: 'p1' } as any)
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT, session: { ...CHAT_SESSION, sessionType: 'task', taskId: 'task-1' } })

    await run({ ...CONTEXT, credential: GRANTED })

    expect(logins.join).toHaveBeenCalledTimes(1)
    const [home, credential] = logins.join.mock.calls[0]
    expect(home).toContain('/projects/p1/')
    expect(credential).toEqual(GRANTED)
    expect(logins.leave).toHaveBeenCalledWith({ home, loginId: 'login-1' })
  })

  it("joins a person's own chat run in their storage the same way", async () => {
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'user', ownerId: 'u1' })
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT, session: CHAT_SESSION })
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)

    await run({ ...CONTEXT, credential: GRANTED })

    expect(logins.join).toHaveBeenCalledTimes(1)
    expect(logins.leave).toHaveBeenCalledTimes(1)
  })

  it("writes a person's own subscription that arrives as hq's provider descriptor as the run's login", async () => {
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'user', ownerId: 'u1' })
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT, session: CHAT_SESSION })
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)

    await run({
      ...CONTEXT,
      credential: null,
      modelAccess: {
        model: { providerId: 'prov-mine', model: 'claude-x' },
        provider: { kind: 'subscription', providerId: 'prov-mine', vendor: 'anthropic', oauthJson: ADAS_DOCUMENT, grantId: 'grant-1', loginId: 'login-1' },
        billingProfileId: 'bp-1',
      },
    })

    expect(logins.join).toHaveBeenCalledTimes(1)
    expect(logins.join.mock.calls[0][1]).toEqual({ ...GRANTED, providerId: 'prov-mine' })
    expect(logins.leave).toHaveBeenCalledTimes(1)
  })
})
