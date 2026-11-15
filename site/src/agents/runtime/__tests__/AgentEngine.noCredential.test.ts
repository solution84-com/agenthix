/**
 * Spec §6.3: a Claude SDK run with no usable model credential fails saying so,
 * naming the boundary it was for. The point is the message, not the failure —
 * the run already could not have worked; before this it fell through to
 * whatever login happened to be seeded on the machine, or died inside the SDK
 * with nothing the person could act on.
 *
 * The OpenCode runtime is deliberately NOT covered by that check: it reaches
 * its providers with an API key, so a null credential is an ordinary state for
 * this gate and it makes its own check. Both are
 * pinned here — a gate that fired for every runtime would refuse runs that
 * work, which is the harder failure to notice.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    async *run() {
      yield { type: 'status', status: 'completed' }
    },
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

describe('a run with no model credential @SC-782', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
      taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.transcriptEntry.count.mockResolvedValue(0)
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    mockPrisma.agentSession.findUnique.mockResolvedValue({ id: 'sess-1', title: 'A chat' })
    h.resolveAgentContext.mockResolvedValue({ agent: SDK_AGENT, session: SESSION_FIXTURE })
    h.prepareAgentContainer.mockResolvedValue(null)
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'user', ownerId: 'u1' })
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
      userId: 'u1', workspaceId: null, role: null,
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)
  })

  it('refuses a capability that names no runner before marking the run RUNNING', async () => {
    vi.mocked(verifyHqToken).mockResolvedValue({
      sessionId: 'sess-1', agentId: 'agent-1', userId: 'u1', runner: null, siteId: 'site-1',
      permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      exp: Math.floor(Date.now() / 1000) + 900,
    } as any)

    const outcome = await run(CONTEXT)

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(failedError()).toContain('names no runner')
    expect(mockPrisma.agentRun.update.mock.calls.some(([arg]: any[]) => arg?.data?.status === 'RUNNING')).toBe(false)
    expect(h.prepareAgentContainer).not.toHaveBeenCalled()
  })

  it('fails the run, and never prepares a container or starts the runtime', async () => {
    const outcome = await run(CONTEXT)

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(h.prepareAgentContainer).not.toHaveBeenCalled()
    expect(selectRuntime).not.toHaveBeenCalled()
  })

  it('says which boundary has none, and where to set one — the text the person reads', async () => {
    await run(CONTEXT)

    expect(failedError()).toBe(
      'No model credential is configured for this person. ' +
      'Add an API key for it, or a subscription login on your own settings page, and run this again.',
    )
    expect(siteStream.status).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('No model credential is configured') }),
    )
  })

  it('shows the reason hq gave, verbatim, in place of the generic text', async () => {
    const problem =
      'The organisation\'s Claude subscription is not used because the organisation has more than one person. ' +
      'An admin sets the organisation\'s API key under Settings → Model Access.'

    const outcome = await run({ ...CONTEXT, credentialProblem: problem })

    expect(outcome).toEqual({ status: 'FAILED' })
    expect(failedError()).toBe(problem)
    expect(h.prepareAgentContainer).not.toHaveBeenCalled()
    // Written for the person, so the conversation shows it as it is.
    const failure = mockPrisma.transcriptEntry.createMany.mock.calls.flatMap(([a]: any[]) => a.data).find((r: any) => r.kind === 'RUN_FAILED')
    expect(failure).toMatchObject({ detail: { reason: problem } })
  })

  it('names the project when the run works in a project\'s storage', async () => {
    locationMock.resolvePrimaryLocation.mockReturnValue({ ownerType: 'project', ownerId: 'p1' } as any)

    await run(CONTEXT)

    expect(failedError()).toContain('configured for this project')
  })

  it('does not fire for an OpenCode run, which has providers of its own to reach', async () => {
    const opencodeAgent = { ...SDK_AGENT, runtime: 'opencode' }
    h.resolveAgentContext.mockResolvedValue({ agent: opencodeAgent, session: SESSION_FIXTURE })

    const outcome = await run({ ...CONTEXT, agent: opencodeAgent as any })

    expect(outcome).not.toEqual({ status: 'FAILED' })
    expect(selectRuntime).toHaveBeenCalledWith('opencode')
    expect(failedError()).toBe('')
  })

  it('does not fire for an OpenCode run even when hq gave a reason', async () => {
    const opencodeAgent = { ...SDK_AGENT, runtime: 'opencode' }
    h.resolveAgentContext.mockResolvedValue({ agent: opencodeAgent, session: SESSION_FIXTURE })

    const outcome = await run({ ...CONTEXT, agent: opencodeAgent as any, credentialProblem: 'P' })

    expect(outcome).not.toEqual({ status: 'FAILED' })
    expect(failedError()).toBe('')
  })

  it('does not fire when a credential was supplied', async () => {
    const outcome = await run({ ...CONTEXT, modelAccess: { model: { providerId: 'p-ant', model: 'claude-x' }, provider: { kind: 'api_key', providerId: 'p-ant', vendor: 'anthropic', apiKey: 'sk-live' }, billingProfileId: '' } })

    expect(outcome).not.toEqual({ status: 'FAILED' })
    expect(selectRuntime).toHaveBeenCalledWith('claude-sdk')
  })
})
