/**
 * One terminal frame per run (spec review, BLOCKER 1). Before this fix, site
 * sent TWO terminal frames for a deferred run: the engine's own (always
 * `manifestPending: null`) finalized hq's task before deferredManifestReport's
 * frame — carrying the `manifestPending` that actually mattered — ever
 * arrived, and hq's terminal-frame latch silently dropped it. HITL approval
 * never happened; the task falsely reported success; the run sat
 * PENDING_APPROVAL on site forever.
 *
 * This pins the fix at its source: when `options.deferredManifest` is
 * non-empty by the time `processRun` reaches its terminal frame, the engine
 * sends NO `siteStream.status(...)` frame of its own — the driver
 * (deferredManifestReport.ts, exercised separately) is the run's single
 * terminal sender instead. The withheld payload rides on the resolved
 * `RunOutcome.withheldFrame` so that sender can relay it verbatim.
 *
 * The lightest seam
 * that still runs AgentEngine.run() end to end and observes the actual
 * siteStream.status(...) calls (or their absence).
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  mockStatus: vi.fn(),
  resolveAgentContext: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), findUnique: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
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
  getAgentFacingSiteUrl: vi.fn(() => ''),
}))

vi.mock('../SiteStreamEmitter', () => ({
  siteStream: { stream: vi.fn(), status: h.mockStatus },
}))

let runtimeBehavior: 'completed' | 'failed' = 'completed'

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(function () { return ({
    async sessionExists() { return true },
    async *run(_context: any) {
      yield { type: 'text_delta', textDelta: 'The reply text.' }
      if (runtimeBehavior === 'failed') {
        yield { type: 'status', status: 'failed', error: 'boom' }
      } else {
        yield { type: 'status', status: 'completed', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } }
      }
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
  mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  mockPrisma.agentRun.update.mockResolvedValue(undefined)
  mockPrisma.agentSession.update.mockResolvedValue({
    totalInputTokens: 1, totalOutputTokens: 2, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
  })
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

function dispatchContext(): RunContextPayload {
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
  }
}

function terminalCall() {
  return h.mockStatus.mock.calls.find(([e]) => e.status !== 'RUNNING')
}

describe('AgentEngine — one terminal frame per run (deferred-manifest withholding)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENT_CONTAINER_ISOLATION
    runtimeBehavior = 'completed'
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockAgentRun()
  })

  it('an EMPTY deferredManifest sends the terminal frame as normal (unaffected by this fix)', async () => {
    const deferredManifest = { tools: [], bashPatterns: [] }

    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, deferredManifest })

    expect(h.mockStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }))
    expect(outcome?.withheldFrame).toBeUndefined()
  })

  it('a NON-EMPTY deferredManifest at terminal time — the engine sends no TERMINAL status frame (RUNNING still fires)', async () => {
    const deferredManifest = { tools: [{ name: 'Bash', reason: 'needs it' }], bashPatterns: [] }

    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, deferredManifest })

    // The RUNNING frame (step 2 of processRun) still fires — only the
    // TERMINAL frame is withheld.
    expect(terminalCall()).toBeUndefined()
    expect(h.mockStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'RUNNING' }))
  })

  it('a NON-EMPTY deferredManifest on a COMPLETED run — the outcome carries the withheld sessionPatch', async () => {
    const deferredManifest = { tools: [{ name: 'Bash' }], bashPatterns: [] }

    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, deferredManifest })

    expect(outcome?.status).toBe('COMPLETED')
    expect(outcome?.withheldFrame).toEqual({
      sessionPatch: { totalInputTokens: 1, totalOutputTokens: 2, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 },
    })
  })

  it('a NON-EMPTY deferredManifest on a FAILED run — the engine still sends no TERMINAL frame, and the outcome relays the true FAILED status', async () => {
    runtimeBehavior = 'failed'
    const deferredManifest = { tools: [{ name: 'Bash' }], bashPatterns: [] }

    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, deferredManifest })

    expect(terminalCall()).toBeUndefined()
    expect(outcome?.status).toBe('FAILED')
    // The failure is relayed beside the request, so hq keeps both.
    expect(outcome?.withheldFrame).toEqual({ sessionPatch: null, error: expect.any(String) })
  })

  it('an EMPTY deferredManifest on a FAILED run sends the terminal frame as normal', async () => {
    runtimeBehavior = 'failed'
    const deferredManifest = { tools: [], bashPatterns: [] }

    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, deferredManifest })

    expect(h.mockStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }))
    expect(outcome?.withheldFrame).toBeUndefined()
  })

  it('no deferredManifest collector at all (e.g. a bypassed run) behaves exactly as before', async () => {
    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.mockStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }))
    expect(outcome?.withheldFrame).toBeUndefined()
  })
})
