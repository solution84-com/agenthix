import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  mockStatus: vi.fn(),
  resolveAgentContext: vi.fn(),
  // Site's own AgentSession.title, as the engine reads it at the terminal frame.
  // `renameDuringRun`, when set, is written to it while the run is streaming —
  // the user's rename (hq's updateSession renames site's row first).
  siteRowTitle: null as string | null,
  renameDuringRun: null as string | null,
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
  siteStream: { stream: vi.fn(), status: h.mockStatus },
}))

// Emits real text so the run has a genuine reply —
// AgentEngine.runToken.test.ts's runtime mock never emits text_delta.
vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run(_context: any) {
      if (h.renameDuringRun) h.siteRowTitle = h.renameDuringRun
      yield { type: 'text_delta', textDelta: 'The reply text.' }
      yield { type: 'status', status: 'completed', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } }
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

import { agentEngine } from '../AgentEngine'
import { verifyHqToken } from '../../../server/identity/verifyHqToken'

function mockAgentRun(overrides: Record<string, unknown> = {}) {
  mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  mockPrisma.agentRun.update.mockResolvedValue(undefined)
  mockPrisma.agentSession.update.mockResolvedValue({
    totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
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

function runningCall() {
  return h.mockStatus.mock.calls.find(([e]) => e.status === 'RUNNING')?.[0]
}

function statusCall(status: string) {
  return h.mockStatus.mock.calls.find(([e]) => e.status === status)?.[0]
}

/** Runs a deliberately failing run, asserting (and so silencing) the engine's own failure log. */
async function runExpectingFatalLog(options: Parameters<typeof agentEngine.run>[1]) {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await agentEngine.run('run-1', options)
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/FATAL ERROR for run run-1.*RUNNING write failed/))
  } finally {
    errorLog.mockRestore()
  }
}

const TOTALS = { totalInputTokens: 1, totalOutputTokens: 2, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 }

describe('AgentEngine — the RUNNING frame carries a title the site generated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockAgentRun()
  })

  it('sessionTitle set → RUNNING frame sessionPatch is { title }', async () => {
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
    expect(runningCall()!.sessionPatch).toEqual({ title: 'Billing dashboard' })
  })

  it('no sessionTitle → RUNNING frame sessionPatch is null', async () => {
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(runningCall()!.sessionPatch).toBeNull()
  })
})

// The RUNNING frame is sent once and a lost title never regenerates (site's row
// is no longer untitled), so the terminal frames carry the title too — as it
// reads on site's own row when the run ends, never the value captured at dispatch.
describe('AgentEngine — the terminal frames carry the title as it reads on site\'s row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockAgentRun()
    mockPrisma.agentSession.update.mockResolvedValue(TOTALS)
    h.siteRowTitle = 'Billing dashboard'
    h.renameDuringRun = null
    mockPrisma.agentSession.findUnique.mockImplementation(async () => ({ title: h.siteRowTitle }))
  })

  it('a run that fails before its RUNNING frame still sends the title on its FAILED frame', async () => {
    mockPrisma.agentRun.update.mockRejectedValueOnce(new Error('RUNNING write failed'))
    await runExpectingFatalLog({ dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
    expect(runningCall()).toBeUndefined()
    expect(statusCall('FAILED')!.sessionPatch).toEqual({ title: 'Billing dashboard' })
  })

  it('a session still titled "New Conversation" → the FAILED frame sessionPatch stays null', async () => {
    h.siteRowTitle = 'New Conversation'
    mockPrisma.agentRun.update.mockRejectedValueOnce(new Error('RUNNING write failed'))
    await runExpectingFatalLog({ dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(statusCall('FAILED')!.sessionPatch).toBeNull()
  })

  it('the COMPLETED frame carries the title alongside its token totals', async () => {
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
    expect(statusCall('COMPLETED')!.sessionPatch).toEqual({ ...TOTALS, title: 'Billing dashboard' })
  })

  it('a session still titled "New Conversation" → the COMPLETED frame carries its token totals and no title key', async () => {
    h.siteRowTitle = 'New Conversation'
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    const patch = statusCall('COMPLETED')!.sessionPatch
    expect(patch).toEqual(TOTALS)
    expect(patch).not.toHaveProperty('title')
  })

  it('a deferred run withholds its terminal frame — the withheld patch carries the title too', async () => {
    const deferredManifest = { tools: [{ name: 'Bash', reason: '' }], bashPatterns: [] }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard', deferredManifest,
    })
    expect(statusCall('COMPLETED')).toBeUndefined()
    expect(outcome?.withheldFrame?.sessionPatch).toEqual({ ...TOTALS, title: 'Billing dashboard' })
  })

  it('a rename during the run → the COMPLETED frame carries the renamed title, not the auto-title', async () => {
    h.renameDuringRun = 'Q3 invoices'
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
    expect(runningCall()!.sessionPatch).toEqual({ title: 'Billing dashboard' })
    expect(statusCall('COMPLETED')!.sessionPatch).toEqual({ ...TOTALS, title: 'Q3 invoices' })
  })

  it('a rename during a deferred run → the withheld patch carries the renamed title', async () => {
    h.renameDuringRun = 'Q3 invoices'
    const deferredManifest = { tools: [{ name: 'Bash', reason: '' }], bashPatterns: [] }
    const outcome = await agentEngine.run('run-1', {
      dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard', deferredManifest,
    })
    expect(outcome?.withheldFrame?.sessionPatch).toEqual({ ...TOTALS, title: 'Q3 invoices' })
  })

  it('a rename before a failure → the FAILED frame carries the renamed title', async () => {
    h.siteRowTitle = 'Q3 invoices'
    mockPrisma.agentRun.update.mockRejectedValueOnce(new Error('RUNNING write failed'))
    await runExpectingFatalLog({ dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
    expect(statusCall('FAILED')!.sessionPatch).toEqual({ title: 'Q3 invoices' })
  })

  it("a failed read of site's row omits the title and does not fail the run", async () => {
    mockPrisma.agentSession.findUnique.mockRejectedValue(new Error('db unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' })
      expect(outcome?.status).toBe('COMPLETED')
      const patch = statusCall('COMPLETED')!.sessionPatch
      expect(patch).toEqual(TOTALS)
      expect(patch).not.toHaveProperty('title')
    } finally {
      warn.mockRestore()
    }
  })
})

// R-056: the same guarantee on the paths that never reach a RUNNING or a
// COMPLETED frame. The title is on site's row and nothing will regenerate it, so
// each of these must still hand it to hq.
describe('AgentEngine — a run that never starts still delivers the title', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: SESSION_FIXTURE })
    mockAgentRun()
    h.siteRowTitle = 'Billing dashboard'
    h.renameDuringRun = null
    mockPrisma.agentSession.findUnique.mockImplementation(async () => ({ title: h.siteRowTitle }))
  })

  describe('a skipped run', () => {
    it('chat path: a run already CANCELLED reports its true status with the title, and starts nothing', async () => {
      mockAgentRun({ status: 'CANCELLED', taskId: null })
      const outcome = await agentEngine.run('run-1', {
        queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard',
      })
      expect(outcome).toBeUndefined()
      expect(runningCall()).toBeUndefined()
      expect(h.mockStatus).toHaveBeenCalledTimes(1)
      expect(statusCall('CANCELLED')).toMatchObject({
        runId: 'run-1', sessionId: 'sess-1', agentId: 'agent-1', agentHandle: 'test-agent',
        sessionPatch: { title: 'Billing dashboard' }, manifestPending: null,
      })
    })

    it('launch path: a run no longer PENDING once it reaches the front of the queue does the same', async () => {
      mockAgentRun({ status: 'CANCELLED' })
      const outcome = await agentEngine.run('run-1', {
        dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard',
      })
      expect(outcome).toBeUndefined()
      expect(runningCall()).toBeUndefined()
      expect(statusCall('CANCELLED')!.sessionPatch).toEqual({ title: 'Billing dashboard' })
    })

    it('sends the title as it reads on site\'s row now, not the one captured at dispatch', async () => {
      mockAgentRun({ status: 'CANCELLED' })
      h.siteRowTitle = 'Q3 invoices'
      await agentEngine.run('run-1', {
        queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard',
      })
      expect(statusCall('CANCELLED')!.sessionPatch).toEqual({ title: 'Q3 invoices' })
    })

    it('a dispatch that generated no title sends no frame at all', async () => {
      mockAgentRun({ status: 'CANCELLED' })
      await agentEngine.run('run-1', { queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
      expect(h.mockStatus).not.toHaveBeenCalled()
    })

    it('a run row that does not exist sends no frame', async () => {
      mockPrisma.agentRun.findUnique.mockResolvedValue(null)
      await agentEngine.run('run-1', {
        queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard',
      })
      expect(h.mockStatus).not.toHaveBeenCalled()
    })

    it('a duplicate trigger for a run already in flight sends nothing — the first trigger delivers the title', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>(resolve => { release = resolve })
      mockPrisma.agentRun.update.mockImplementationOnce(async () => { await gate })
      const options = { queued: true as const, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard' }
      const first = agentEngine.run('run-1', options)
      await vi.waitFor(() => expect(mockPrisma.agentRun.update).toHaveBeenCalled())
      expect(await agentEngine.run('run-1', options)).toBeUndefined()
      expect(h.mockStatus).not.toHaveBeenCalled()
      release()
      await first
    })
  })

  describe('a capability check that throws before the run starts', () => {
    const rejectCapability = () => vi.mocked(verifyHqToken).mockRejectedValueOnce(new Error('capability expired'))

    it('sends the FAILED frame, carrying the title and the run\'s own task id', async () => {
      mockAgentRun({ taskId: 'task-9' })
      rejectCapability()
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const outcome = await agentEngine.run('run-1', {
          queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, sessionTitle: 'Billing dashboard',
        })
        expect(outcome?.status).toBe('FAILED')
      } finally {
        errorLog.mockRestore()
      }
      expect(runningCall()).toBeUndefined()
      expect(statusCall('FAILED')).toMatchObject({
        runId: 'run-1', sessionId: 'sess-1', taskId: 'task-9', error: 'capability expired',
        sessionPatch: { title: 'Billing dashboard' },
      })
    })

    it('a session still untitled → the FAILED frame is sent with a null sessionPatch', async () => {
      h.siteRowTitle = 'New Conversation'
      rejectCapability()
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await agentEngine.run('run-1', { queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
      } finally {
        errorLog.mockRestore()
      }
      expect(statusCall('FAILED')!.sessionPatch).toBeNull()
    })

    it('a run row that cannot be found sends no frame — there is no session to name', async () => {
      mockPrisma.agentRun.findUnique.mockResolvedValueOnce({ id: 'run-1', status: 'PENDING', sessionId: 'sess-1', taskId: null })
        .mockResolvedValue(null)
      rejectCapability()
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await agentEngine.run('run-1', { queued: true, dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
      } finally {
        errorLog.mockRestore()
      }
      expect(h.mockStatus).not.toHaveBeenCalled()
    })
  })
})
