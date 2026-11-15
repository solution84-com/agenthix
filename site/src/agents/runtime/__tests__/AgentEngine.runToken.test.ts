/**
 * Spec §H4 defect 3: the agent container gets an opaque, run-scoped MCP
 * bearer, never the site's static MCP key and never the capability JWT
 * itself. This exercises AgentEngine.run() end to end (the real MCP-config
 * block, capability-holder wiring, and run-cleanup path in AgentEngine.ts)
 * against a fully mocked runtime/DB/collaborator boundary — there is no
 * lighter seam that still observes the actual `mcpServers`/`gitCredEnv`
 * headers AgentEngine builds and hands to the runtime.
 *
 * AGENT_CONTAINER_ISOLATION is unset in unit tests (unit-setup.ts does not
 * load .env.server), so `prepareAgentContainer` short-circuits before it ever
 * touches AgentContainerManager/Docker — nothing here needs to mock that.
 *
 * Severed from hq's version (plan 5d-2 task 7b): `db` is gone — site's own
 * `prisma` (mocked below with site's runtime-model delegate names) is read
 * directly. Capability mint (`resolveCapabilityClaims` + `signCapability`) is
 * gone too — the run now arrives with a pre-minted `capabilityJwt` (this
 * file's own CAPABILITY_JWT fixture) and AgentEngine only VERIFIES it, via
 * site's own `verifyHqToken` (mocked here) rather than hq's.
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
      const bearer = context.gitCredEnv?.SITE_MCP_KEY
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

import { agentEngine } from '../AgentEngine'
import { resolveRunToken } from '../../../server/runtime/runTokens'

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

describe('AgentEngine — run token replaces the static MCP key (spec §H4) @SC-302', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.capturedContext = null
    h.midRunHolder = undefined
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockAgentRun()
  })

  it('mints an opaque run token — not the capability JWT — and it resolves to the run holder while the run is live', async () => {
    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS })

    const bearer = h.capturedContext.gitCredEnv.SITE_MCP_KEY
    expect(bearer).toMatch(/.+/)
    expect(bearer).not.toBe(CAPABILITY_JWT)

    // Resolved from inside the mocked runtime, i.e. while the run was still active.
    expect(h.midRunHolder).not.toBeNull()
    expect(h.midRunHolder).toBe(h.capturedContext.capability)
  })

  it('does not send X-Agent-Handle in the MCP headers', async () => {
    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS })

    const headers = h.capturedContext.mcpServers.platform.headers
    expect(headers['X-Agent-Handle']).toBeUndefined()
    expect(Object.keys(headers)).toEqual(['Authorization'])
  })

  it("names the run token's variable in the MCP connection, which goes on the CLI's command line, and never holds the token there", async () => {
    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS })

    expect(h.capturedContext.mcpServers.platform.headers.Authorization).toBe('Bearer ${SITE_MCP_KEY}')
    expect(JSON.stringify(h.capturedContext.mcpServers)).not.toContain(h.capturedContext.gitCredEnv.SITE_MCP_KEY)
  })

  it('revokes the run token once the run completes successfully', async () => {
    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS })

    const bearer = h.capturedContext.gitCredEnv.SITE_MCP_KEY
    expect(resolveRunToken(bearer)).toBeNull()
  })

  it('revokes the run token even when the run fails', async () => {
    const { selectRuntime } = await import('../selectRuntime')
    ;(selectRuntime as any).mockImplementationOnce(() => ({
      async sessionExists() { return true },
      async *run(context: any) {
        h.capturedContext = context
        yield { type: 'status', status: 'failed', error: 'boom' }
      },
    }))

    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: CAPABILITY_JWT, runLimits: DEFAULT_RUN_LIMITS }) // processRun swallows the error internally

    const bearer = h.capturedContext.gitCredEnv.SITE_MCP_KEY
    expect(resolveRunToken(bearer)).toBeNull()
    expect(mockPrisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })
})
