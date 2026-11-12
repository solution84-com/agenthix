/**
 * Run limits (spec §7): a run is stopped when it reaches its time limit, and an
 * unattended run also when it goes past its turn limit; the stop records a
 * reason that names the limit. A run a person started has no turn limit.
 * Scaffold as AgentEngine.turnOutcome.test.ts.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isRunLimitReason } from '@agenthix/core'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  mockStatus: vi.fn(),
  mockStream: vi.fn(),
  script: null as null | ((context: any) => AsyncGenerator<any>),
  waiting: null as null | (() => void),
  resolveAgentContext: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
  AgentPromptBuilder: vi.fn().mockImplementation(() => ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
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
  siteStream: { stream: h.mockStream, status: h.mockStatus },
}))

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    run: (context: any) => h.script!(context),
  })),
}))

import { agentEngine } from '../AgentEngine'

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
const dispatchContext = (): RunContextPayload => ({
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
})

/** The runtime waits for the stop, having handed over everything before it. */
const aborted = (context: any) => new Promise<void>(resolve => {
  context.abortSignal.addEventListener('abort', () => resolve(), { once: true })
  h.waiting?.()
})
const runStatuses = () => mockPrisma.agentRun.update.mock.calls.map(([a]) => a.data.status).filter(Boolean)
const transcript = () => mockPrisma.transcriptEntry.create.mock.calls.map(([a]) => a.data.content)
const frame = () => h.mockStatus.mock.calls.at(-1)?.[0]


const roundTrips = (n: number) => Array.from({ length: n }, () => ({ type: 'model_round_trip' }))

/** Starts the turn and resolves once the runtime is waiting to be stopped. */
async function start(options: Record<string, unknown>) {
  const waiting = new Promise<void>(resolve => { h.waiting = resolve })
  const run = agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, ...options })
  await waiting
  return run
}

describe('AgentEngine — run limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockPrisma.agentRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1', taskId: null, inputText: 'hi', approvedManifest: null,
    })
    mockPrisma.agentRun.update.mockResolvedValue(undefined)
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.agentSession.update.mockResolvedValue({ totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 })
  })

  it('stops an unattended run that goes past its turn limit, naming the limit', async () => {
    h.script = async function* (context) {
      yield* roundTrips(3)
      if (!context.abortSignal.aborted) await aborted(context)
      yield { type: 'status', status: 'cancelled', error: 'Cancelled' }
    }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', startedBy: 'pulse', runLimits: { timeLimitMinutes: 60, turnLimit: 2 },
    })
    expect(outcome).toEqual({ status: 'CANCELLED' })
    expect(frame()).toMatchObject({ status: 'CANCELLED', error: expect.stringContaining('turn limit of 2 turns') })
    expect(isRunLimitReason(frame().error)).toBe(true)
  })

  it('lets an unattended run finish on its last allowed turn', async () => {
    h.script = async function* () {
      yield* roundTrips(2)
      yield { type: 'status', status: 'completed' }
    }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', startedBy: 'schedule', runLimits: { timeLimitMinutes: 60, turnLimit: 2 },
    })
    expect(outcome).toEqual({ status: 'COMPLETED' })
  })

  it('applies no turn limit to a run a person started', async () => {
    h.script = async function* () {
      yield* roundTrips(50)
      yield { type: 'status', status: 'completed' }
    }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', startedBy: 'person', runLimits: { timeLimitMinutes: 60, turnLimit: 2 },
    })
    expect(outcome).toEqual({ status: 'COMPLETED' })
  })

  it("stops a run at a limit its runtime names (the demo's scripted runtime), as the limit watch would: stopped, not failed", async () => {
    h.script = async function* (context) {
      yield { type: 'text_delta', textDelta: 'Partway.' }
      await agentEngine.stopAtLimit(context.runId, 'turns', { timeLimitMinutes: 60, turnLimit: 7 })
    }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', startedBy: 'person', runLimits: { timeLimitMinutes: 60, turnLimit: 7 },
    })
    expect(outcome).toEqual({ status: 'CANCELLED' })
    expect(frame()).toMatchObject({ status: 'CANCELLED', error: expect.stringContaining('turn limit of 7 turns') })
    expect(isRunLimitReason(frame().error)).toBe(true)
    expect(runStatuses()).not.toContain('FAILED')
  })

  describe('the time limit', () => {
    const realSetTimeout = globalThis.setTimeout
    const limitMs = 30 * 60_000
    // The limit's own timer fires at once; every other timer is left alone.
    beforeEach(() => {
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
        const timer = realSetTimeout(fn, ms === limitMs ? 0 : ms)
        return timer
      }) as typeof setTimeout)
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('stops a run, a person\'s included, after its time limit and names it', async () => {
      h.script = async function* (context) {
        if (!context.abortSignal.aborted) await aborted(context)
        yield { type: 'status', status: 'cancelled', error: 'Cancelled' }
      }
      const outcome = await agentEngine.run('run-1', {
        dispatchContext: dispatchContext(), capabilityJwt: 'jwt', startedBy: 'person', runLimits: { timeLimitMinutes: 30, turnLimit: 100 },
      })
      expect(outcome).toEqual({ status: 'CANCELLED' })
      expect(frame()).toMatchObject({ status: 'CANCELLED', error: expect.stringContaining('time limit of 30 minutes') })
      expect(isRunLimitReason(frame().error)).toBe(true)
    })
  })
})
