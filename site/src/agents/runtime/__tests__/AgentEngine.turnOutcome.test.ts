/**
 * How a turn ends, as the run row, the transcript and the terminal frame
 * record it: a Stop is CANCELLED and says so (never COMPLETED with a guess
 * about credentials), a runtime's own cancel is CANCELLED, a failure carries
 * the runtime's reason, a turn that said nothing says that plainly, and a
 * runtime's notice (a provider being retried) reaches the chat as a stream
 * frame.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_RUN_LIMITS, type RunContextPayload } from '@agenthix/core'

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

/** The runtime waits for the Stop, having handed over everything before it. */
const aborted = (context: any) => new Promise<void>(resolve => {
  context.abortSignal.addEventListener('abort', () => resolve(), { once: true })
  h.waiting?.()
})
const runStatuses = () => mockPrisma.agentRun.update.mock.calls.map(([a]) => a.data.status).filter(Boolean)
const rows = () => mockPrisma.transcriptEntry.createMany.mock.calls.flatMap(([a]) => a.data as Array<Record<string, any>>)
const transcript = () => rows().map(r => r.kind ?? r.content)
const frame = () => h.mockStatus.mock.calls.at(-1)?.[0]

/** Runs the turn, pressing Stop once the runtime waits for it. */
async function runAndStop(reason?: 'interrupted') {
  const running = new Promise<void>(resolve => { h.waiting = resolve })
  const run = agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
  await running
  await agentEngine.cancelRun('run-1', reason)
  return run
}

describe('AgentEngine — how a turn ends', () => {
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

  it('a Stop before any output is CANCELLED and the transcript says it was stopped', async () => {
    h.script = async function* (context) {
      await aborted(context)
      yield { type: 'status', status: 'cancelled', error: 'Cancelled' }
    }
    const outcome = await runAndStop()

    expect(outcome).toEqual({ status: 'CANCELLED' })
    expect(runStatuses()).not.toContain('COMPLETED')
    expect(runStatuses().at(-1)).toBe('CANCELLED')
    expect(transcript()).toEqual(['RUN_STOPPED'])
    expect(rows()[0]).toMatchObject({ runId: 'run-1', role: 'SYSTEM', detail: { cause: 'person', by: null } })
    expect(frame()).toMatchObject({ status: 'CANCELLED', error: 'Cancelled by user' })
  })

  it('a Stop for a new message says so', async () => {
    h.script = async function* (context) { await aborted(context) }
    await runAndStop('interrupted')
    expect(transcript()).toEqual(['RUN_STOPPED'])
    expect(rows()[0]).toMatchObject({ detail: { cause: 'new_message', by: null } })
    expect(frame()).toMatchObject({ status: 'CANCELLED', error: 'Interrupted by a new message' })
  })

  it('a Stop after some text keeps the text as the reply, then says it was stopped', async () => {
    h.script = async function* (context) {
      yield { type: 'text_delta', textDelta: 'Half an ans' }
      await aborted(context)
    }
    await runAndStop()
    expect(transcript()).toEqual(['Half an ans', 'RUN_STOPPED'])
    expect(runStatuses().at(-1)).toBe('CANCELLED')
  })

  it('a cancel the runtime reports itself is CANCELLED, not FAILED', async () => {
    h.script = async function* () { yield { type: 'status', status: 'cancelled', error: 'Cancelled' } }
    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(outcome).toEqual({ status: 'CANCELLED' })
    expect(frame()).toMatchObject({ status: 'CANCELLED' })
  })

  it('a failed turn is FAILED with the runtime\'s reason', async () => {
    h.script = async function* () { yield { type: 'status', status: 'failed', error: 'The model provider answered 429: Rate limit exceeded' } }
    const outcome = await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(outcome).toEqual({ status: 'FAILED' })
    expect(frame()).toMatchObject({ status: 'FAILED', error: 'The model provider answered 429: Rate limit exceeded' })
  })

  it('a failed turn keeps what it did, and its reason in plain words where the reply would be', async () => {
    h.script = async function* () {
      yield { type: 'tool_call', toolUseId: 'c1', toolName: 'read_file', toolInput: { path: 'a.ts' } }
      yield { type: 'tool_result', toolUseId: 'c1', output: 'x' }
      yield { type: 'status', status: 'failed', error: 'The model provider answered 529: overloaded_error' }
    }
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(transcript()).toEqual(['read_file', 'RUN_FAILED'])
    expect(rows()[1]).toMatchObject({ runId: 'run-1', detail: { reason: 'The model provider was overloaded.' } })
    expect(frame()).toMatchObject({ status: 'FAILED', error: 'The model provider answered 529: overloaded_error' })
  })

  it('a runtime that throws part way still leaves what the turn did', async () => {
    h.script = async function* () {
      yield { type: 'tool_call', toolUseId: 'c1', toolName: 'bash', toolInput: { command: 'npm test' } }
      throw new Error('Claude Code process ended during the turn')
    }
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(transcript()).toEqual(['bash', 'RUN_FAILED'])
    expect(rows()[1]).toMatchObject({ detail: { reason: "The agent's process stopped unexpectedly." } })
  })

  it("keeps the runtime's memory of the conversation on the run and the session, and where it summarised", async () => {
    const use = { tokens: 124000, summarisesAt: 184000, window: 200000, at: '2026-10-10T10:40:00.000Z' }
    h.script = async function* () {
      yield { type: 'compacted', trigger: 'auto', summary: 'What we agreed.', tokensBefore: 190000 }
      yield { type: 'text_delta', textDelta: 'ok' }
      yield { type: 'context_use', use }
      yield { type: 'status', status: 'completed' }
    }
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(transcript()).toEqual(['CONTEXT_SUMMARISED', 'ok'])
    expect(rows()[0]).toMatchObject({ detail: { trigger: 'auto', summary: 'What we agreed.', tokensBefore: 190000, byId: null } })
    expect(mockPrisma.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', contextUse: use }) }))
    expect(mockPrisma.agentSession.update).toHaveBeenCalledWith({ where: { id: 'sess-1' }, data: { contextUse: use } })
  })

  it('a turn that completed with nothing said records that plainly, with no guess about credentials', async () => {
    h.script = async function* () { yield { type: 'status', status: 'completed' } }
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(transcript()).toEqual(['The agent ended its turn without a reply.'])
    expect(runStatuses().at(-1)).toBe('COMPLETED')
  })

  it('sends a runtime\'s notice to the chat as a live frame', async () => {
    h.script = async function* () {
      yield { type: 'notice', notice: 'The provider is rate-limiting this model; retrying (attempt 1)…' }
      yield { type: 'text_delta', textDelta: 'ok' }
      yield { type: 'status', status: 'completed' }
    }
    await agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    expect(h.mockStream).toHaveBeenCalledWith(expect.objectContaining({
      name: 'agentRunNotice', targetRoom: 'session',
      data: { runId: 'run-1', notice: 'The provider is rate-limiting this model; retrying (attempt 1)…' },
    }))
  })

  it('a Stop that arrives while the run is still launching ends the turn before the model starts, as CANCELLED', async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    // The first write is the run's RUNNING mark; launch waits on it, as it waits on the container and the binds.
    mockPrisma.agentRun.update.mockImplementationOnce(async () => { await held })
    const started = vi.fn()
    h.script = async function* () { started(); yield { type: 'status', status: 'completed' } }
    const run = agentEngine.run('run-1', { dispatchContext: dispatchContext(), capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })
    await vi.waitFor(() => expect(mockPrisma.agentRun.update).toHaveBeenCalled())
    await agentEngine.cancelRun('run-1')
    release()
    const outcome = await run

    expect(started).not.toHaveBeenCalled()
    expect(outcome).toEqual({ status: 'CANCELLED' })
    expect(runStatuses()).not.toContain('COMPLETED')
    expect(transcript()).toEqual(['RUN_STOPPED'])
    expect(frame()).toMatchObject({ status: 'CANCELLED', error: 'Cancelled by user' })
  })
})
