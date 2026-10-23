/**
 * Dispatch handler unit tests (plan 5d-2 task 8, @SC-337) — the run.dispatch
 * ack, the resume/reject/stop/promptPreview control methods. Real chatExecution.ts
 * runs underneath (not mocked) so these tests prove the genuine run-row +
 * dispatch-blob behaviour, not a stand-in for it; only prisma, the engine and
 * the stream emitter are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAgentRunCreate = vi.hoisted(() => vi.fn())
const mockAgentRunFindFirst = vi.hoisted(() => vi.fn())
const mockAgentRunFindUnique = vi.hoisted(() => vi.fn())
const mockAgentRunUpdate = vi.hoisted(() => vi.fn())
const mockAgentSessionUpsert = vi.hoisted(() => vi.fn())
const mockTranscriptEntryCreate = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    agentRun: { create: mockAgentRunCreate, findFirst: mockAgentRunFindFirst, findUnique: mockAgentRunFindUnique, update: mockAgentRunUpdate, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    agentSession: { upsert: mockAgentSessionUpsert, findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    transcriptEntry: { create: mockTranscriptEntryCreate },
  },
}))

const mockEngineRun = vi.hoisted(() => vi.fn())
const mockEngineCancelRun = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/AgentEngine', () => ({
  agentEngine: { run: mockEngineRun, cancelRun: mockEngineCancelRun },
}))

const mockStopAgent = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/AgentContainerManager', () => ({
  agentContainerManager: { stopAgent: mockStopAgent },
}))

const mockSiteStreamStatus = vi.hoisted(() => vi.fn())
const mockSiteStreamStream = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({
  siteStream: { status: mockSiteStreamStatus, stream: mockSiteStreamStream },
}))

const mockBuildChatSections = vi.hoisted(() => vi.fn())
const mockBuildTaskSections = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(() => ({
    buildChatSections: mockBuildChatSections,
    buildTaskSections: mockBuildTaskSections,
  })),
}))

// Spread the real module so exports added later (Task 12's runPackageColumns) stay real.
vi.mock('../../../packages/runPackages', async () => ({
  ...(await vi.importActual<typeof import('../../../packages/runPackages')>('../../../packages/runPackages')),
  resolveRunPackageDirs: vi.fn(async (refs: unknown) => ({ refs, agentDir: '/cache/agent', orgDir: null, platformDir: '/cache/platform' })),
}))
vi.mock('../../../agents/promptContent', () => ({ loadPromptContent: vi.fn(async () => ({ instructions: null, org: null })) }))

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  handleRunDispatch,
  handleRunCancel,
  handleRunReject,
  handleRunApprove,
  handleAgentStop,
  handleAgentRemoveDirectory,
  handleAgentPromptPreview,
} from '../dispatchHandler'

const AGENT_CONFIG = {
  id: 'agent-1', name: 'Agent', handle: 'agent-1-handle', role: null,
  runtime: 'claude-sdk', approval: 'bypassed', defaultModel: 'claude-sonnet-5',
  allowedTools: null, allowedBashPatterns: null, isKernel: false,
}

const CONTEXT = {
  agent: AGENT_CONFIG,
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

const CHAT_DISPATCH_PARAMS = {
  kind: 'chat',
  startedBy: 'person',
  capabilityJwt: 'jwt-1',
  session: {
    id: 'sess-1', sessionKey: 'key-1', agentId: 'agent-1', userId: 'user-1',
    sessionType: 'chat', taskId: null, title: null, model: null, metadata: {},
    primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null, runtime: 'claude-sdk',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  inputText: 'hello',
  model: 'claude-sonnet-5',
  hideUserMessage: false,
  context: CONTEXT,
  runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentSessionUpsert.mockResolvedValue({})
  mockAgentRunCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'run-1', ...data }))
  mockAgentRunFindFirst.mockResolvedValue(null)
})

describe('run.dispatch @SC-337', () => {
  it('acks with {runId, sessionId} synchronously while the engine promise is still pending', async () => {
    // A flag, not just "the resolver exists" (spec review): engineResolved
    // must still read false at the moment the ack is asserted, proving the
    // ack genuinely didn't wait on the engine — a defined-but-unresolved
    // Promise proves nothing about ordering on its own.
    let engineResolved = false
    let resolveEngine: (() => void) | undefined
    mockEngineRun.mockReturnValue(new Promise<void>(resolve => {
      resolveEngine = () => { engineResolved = true; resolve() }
    }))

    const result = await handleRunDispatch(CHAT_DISPATCH_PARAMS)

    expect(result).toEqual({ runId: 'run-1', sessionId: 'sess-1' })
    expect(engineResolved).toBe(false)

    resolveEngine!()
    await new Promise(resolve => setImmediate(resolve))
    expect(engineResolved).toBe(true)
  })

  it('upserts the session idempotently via the same seed-upsert path every call', async () => {
    mockEngineRun.mockReturnValue(new Promise<void>(() => {}))

    await handleRunDispatch(CHAT_DISPATCH_PARAMS)
    await handleRunDispatch(CHAT_DISPATCH_PARAMS)

    expect(mockAgentSessionUpsert).toHaveBeenCalledTimes(2)
    for (const call of mockAgentSessionUpsert.mock.calls) {
      expect(call[0]).toMatchObject({ where: { id: 'sess-1' }, update: {} })
    }
  })

  it('refuses an unknown kind before any run is created', async () => {
    await expect(
      handleRunDispatch({ ...CHAT_DISPATCH_PARAMS, kind: 'bogus' }),
    ).rejects.toThrow(/run\.dispatch/)
    expect(mockAgentRunCreate).not.toHaveBeenCalled()
  })

  // hq dispatches a run it found no model for, so the run fails with the reason
  // and the session is still seeded (runModel.ts, runLaunch.ts).
  it('takes a run with no model when hq says why it has none', async () => {
    mockEngineRun.mockReturnValue(new Promise<void>(() => {}))
    const problem = 'No model provider is working.'

    const result = await handleRunDispatch({
      ...CHAT_DISPATCH_PARAMS,
      model: '',
      context: { ...CONTEXT, credentialProblem: problem },
    })

    expect(result).toEqual({ runId: 'run-1', sessionId: 'sess-1' })
    expect(mockAgentSessionUpsert).toHaveBeenCalledTimes(1)
    expect(mockEngineRun.mock.calls[0][1].dispatchContext.credentialProblem).toBe(problem)
  })

  it('refuses a run with no model and no reason for it', async () => {
    await expect(handleRunDispatch({ ...CHAT_DISPATCH_PARAMS, model: '' })).rejects.toThrow(/credentialProblem/)
    expect(mockAgentRunCreate).not.toHaveBeenCalled()
  })

  // hq's own ChatRunner (dispatchService.ts's buildContext) never dispatches
  // a chat run without context.chat — reaching this state means something is
  // already wrong, so a chat dispatch missing it is refused at the boundary
  // rather than silently degrading to a context-free prompt (spec review).
  it('refuses a chat dispatch whose context carries no context.chat', async () => {
    const { chat: _omitted, ...contextWithoutChat } = CONTEXT
    await expect(
      handleRunDispatch({ ...CHAT_DISPATCH_PARAMS, context: contextWithoutChat }),
    ).rejects.toThrow(/context\.chat/)
    expect(mockAgentRunCreate).not.toHaveBeenCalled()
  })

  // No secret at rest (spec review, HIGH): the dispatch blob persisted onto
  // AgentRun.metadata is {kind, startedBy, runLimits} ONLY — never context (which carries
  // credential, the run's own model credential) or capabilityJwt. Smuggling-style
  // assertion on the exact key set, same technique the session-patch pick
  // test uses — a widened blob type must fail here at the FIRST future edit
  // that adds a field back in, not silently reintroduce the exposure.
  it('persists ONLY {kind, startedBy, runLimits} onto the run row metadata.dispatch — never context or capabilityJwt', async () => {
    mockEngineRun.mockReturnValue(new Promise<void>(() => {}))

    await handleRunDispatch(CHAT_DISPATCH_PARAMS)

    expect(mockAgentRunCreate).toHaveBeenCalledTimes(1)
    const data = mockAgentRunCreate.mock.calls[0][0].data
    expect(Object.keys(data.metadata.dispatch).sort()).toEqual(['kind', 'runLimits', 'startedBy'])
    expect(data.metadata.dispatch).toEqual({ kind: 'chat', startedBy: 'person', runLimits: { timeLimitMinutes: 60, turnLimit: 100 } })
  })
})

describe('run.cancel @SC-523', () => {
  beforeEach(() => mockEngineCancelRun.mockReset())

  it('forwards no reason on an ordinary Stop', async () => {
    await handleRunCancel({ runId: 'run-1' })

    expect(mockEngineCancelRun).toHaveBeenCalledWith('run-1', undefined, undefined)
  })

  it('forwards the name of the person who stopped it', async () => {
    await handleRunCancel({ runId: 'run-1', by: 'ana' })

    expect(mockEngineCancelRun).toHaveBeenCalledWith('run-1', undefined, 'ana')
  })

  it('refuses an empty name', async () => {
    await expect(handleRunCancel({ runId: 'run-1', by: '' })).rejects.toThrow(/by/)
    expect(mockEngineCancelRun).not.toHaveBeenCalled()
  })

  it('forwards reason: "withdrawn" (a waiting message cancelled)', async () => {
    await handleRunCancel({ runId: 'run-1', reason: 'withdrawn', by: 'ana' })

    expect(mockEngineCancelRun).toHaveBeenCalledWith('run-1', 'withdrawn', 'ana')
  })

  it('forwards reason: "interrupted"', async () => {
    await handleRunCancel({ runId: 'run-1', reason: 'interrupted' })

    expect(mockEngineCancelRun).toHaveBeenCalledWith('run-1', 'interrupted', undefined)
  })

  it('reads an unrecognised reason as an ordinary Stop, and still cancels', async () => {
    await handleRunCancel({ runId: 'run-1', reason: 'bogus' })
    expect(mockEngineCancelRun).toHaveBeenCalledWith('run-1', undefined, undefined)
  })
})

describe('run.reject', () => {
  it('rejects a chat run: manifest REJECTED write with when, no message of the person\'s, CANCELLED status frame', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-1', taskId: null, sessionId: 'sess-1', agentId: 'agent-1',
      manifestStatus: 'PENDING_APPROVAL',
      metadata: { dispatch: { kind: 'chat' } },
    })
    mockAgentRunUpdate.mockResolvedValue({})
    mockTranscriptEntryCreate.mockResolvedValue({})

    await handleRunReject({ runId: 'run-1', reason: 'too risky' })

    expect(mockAgentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: 'CANCELLED', manifestStatus: 'REJECTED', error: 'too risky', manifestDecidedAt: expect.any(Date) }),
    })
    expect(mockTranscriptEntryCreate).not.toHaveBeenCalled()
    // The stored blob no longer carries agent config (spec review, HIGH) —
    // agentHandle is always the bare agentId now, never a resolved handle.
    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', status: 'CANCELLED', error: 'too risky', agentHandle: 'agent-1',
    }))
  })

  it('records who denied it, when hq names them', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-3', taskId: null, sessionId: 'sess-3', agentId: 'agent-1', manifestStatus: 'PENDING_APPROVAL', metadata: null,
    })
    mockAgentRunUpdate.mockResolvedValue({})

    await handleRunReject({ runId: 'run-3', reason: 'no', decidedBy: 'user-9' })

    expect(mockAgentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-3' },
      data: expect.objectContaining({ manifestStatus: 'REJECTED', manifestDecidedById: 'user-9' }),
    })
  })

  it('a task run gets no transcript entry (that data is hq-owned)', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-2', taskId: 'task-1', sessionId: 'sess-2', agentId: 'agent-1',
      manifestStatus: 'PENDING_APPROVAL', metadata: null,
    })
    mockAgentRunUpdate.mockResolvedValue({})

    await handleRunReject({ runId: 'run-2' })

    expect(mockTranscriptEntryCreate).not.toHaveBeenCalled()
    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ agentHandle: 'agent-1' }))
  })
})

describe('run.approve', () => {
  // The run approved is the newest of its session (nextRunApproval.test.ts has an overtaken one).
  beforeEach(() => mockAgentRunFindFirst.mockResolvedValue({ id: 'run-1' }))

  it('flips a PENDING_APPROVAL run to APPROVED, stamping manifestDecidedAt', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-1', taskId: 'task-1', manifestStatus: 'PENDING_APPROVAL',
      pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [] },
    })
    mockAgentRunUpdate.mockResolvedValue({})

    const result = await handleRunApprove({ runId: 'run-1' })

    expect(result).toEqual({ approved: true })
    expect(mockAgentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { manifestStatus: 'APPROVED', manifestDecidedAt: expect.any(Date) },
    })
  })

  it('records who approved it, when hq names them', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-1', taskId: 'task-1', manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: [], bashPatterns: [] },
    })
    mockAgentRunUpdate.mockResolvedValue({})

    await handleRunApprove({ runId: 'run-1', decidedBy: 'user-9' })

    expect(mockAgentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { manifestStatus: 'APPROVED', manifestDecidedAt: expect.any(Date), manifestDecidedById: 'user-9' },
    })
  })

  it('leaves pendingManifest untouched — the next run of the task or conversation is given it', async () => {
    mockAgentRunFindUnique.mockResolvedValue({
      id: 'run-1', taskId: 'task-1', manifestStatus: 'PENDING_APPROVAL',
      pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [] },
    })
    mockAgentRunUpdate.mockResolvedValue({})

    await handleRunApprove({ runId: 'run-1' })

    const call = mockAgentRunUpdate.mock.calls[0][0]
    expect(call.data).not.toHaveProperty('pendingManifest')
    expect(call.data).not.toHaveProperty('approvedManifest')
  })

  it('returns { approved: false } and writes nothing when the run does not exist', async () => {
    mockAgentRunFindUnique.mockResolvedValue(null)

    const result = await handleRunApprove({ runId: 'nope' })

    expect(result).toEqual({ approved: false })
    expect(mockAgentRunUpdate).not.toHaveBeenCalled()
  })

  it('returns { approved: false } and writes nothing when the run is not PENDING_APPROVAL', async () => {
    mockAgentRunFindUnique.mockResolvedValue({ id: 'run-1', taskId: 'task-1', manifestStatus: 'APPROVED' })

    const result = await handleRunApprove({ runId: 'run-1' })

    expect(result).toEqual({ approved: false })
    expect(mockAgentRunUpdate).not.toHaveBeenCalled()
  })
})

describe('agent.stop', () => {
  it('delegates to agentContainerManager.stopAgent', async () => {
    mockStopAgent.mockResolvedValue(undefined)
    await handleAgentStop({ handle: 'agent-1-handle' })
    expect(mockStopAgent).toHaveBeenCalledWith('agent-1-handle')
  })
})

// hq owns the agent row; this site owns the disk whatever is left under an
// agent's own name sits on, so the removal that used to happen from hq is
// asked for here. The path is this site's to derive — hq names the agent and
// nothing else. The fixture below is the shape an upgraded install still has
// under `agents/<handle>/`; nothing writes there now.
describe('agent.removeDirectory', () => {
  let sandbox: string
  const originalSiteRoot = process.env.SITE_ROOT

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-remove-'))
    process.env.SITE_ROOT = path.join(sandbox, 'site')
    await fs.mkdir(path.join(sandbox, 'site/agents/scout/home/.claude'), { recursive: true })
    await fs.writeFile(path.join(sandbox, 'site/agents/scout/home/.claude/.credentials.json'), '{}', 'utf-8')
    await fs.mkdir(path.join(sandbox, 'site/agents/keeper'), { recursive: true })
    await fs.mkdir(path.join(sandbox, 'outside'), { recursive: true })
    await fs.writeFile(path.join(sandbox, 'outside/keep.md'), 'outside', 'utf-8')
  })

  afterEach(async () => {
    if (originalSiteRoot === undefined) delete process.env.SITE_ROOT
    else process.env.SITE_ROOT = originalSiteRoot
    await fs.rm(sandbox, { recursive: true, force: true })
  })

  it('removes the one directory the handle names, and nothing beside it', async () => {
    expect(await handleAgentRemoveDirectory({ handle: 'scout' })).toEqual({ removed: true })

    await expect(fs.stat(path.join(sandbox, 'site/agents/scout'))).rejects.toThrow()
    await expect(fs.stat(path.join(sandbox, 'site/agents/keeper'))).resolves.toBeTruthy()
    expect(await fs.readFile(path.join(sandbox, 'outside/keep.md'), 'utf-8')).toBe('outside')
  })

  it('answers removed: false for an agent that never ran here, without failing', async () => {
    expect(await handleAgentRemoveDirectory({ handle: 'never-ran' })).toEqual({ removed: false })
  })

  it.each(['', '.', '..', 'a/b', '../../outside'])(
    'refuses the handle %j, which names no single directory inside this site\'s agents root',
    async (handle) => {
      await expect(handleAgentRemoveDirectory({ handle })).rejects.toThrow()

      await expect(fs.stat(path.join(sandbox, 'site/agents/scout'))).resolves.toBeTruthy()
      expect(await fs.readFile(path.join(sandbox, 'outside/keep.md'), 'utf-8')).toBe('outside')
    },
  )

  // The direct-child check is lexical, so a symlink AT agents/<handle> passes
  // it. What keeps that safe is `fs.rm`'s own behaviour — it lstats, so it
  // unlinks the link and never walks into the target. Pinned here because the
  // handler leans on it instead of a second containment check.
  it('unlinks a symlinked agent directory without following it out of the root', async () => {
    await fs.symlink(path.join(sandbox, 'outside'), path.join(sandbox, 'site/agents/linked'))

    expect(await handleAgentRemoveDirectory({ handle: 'linked' })).toEqual({ removed: true })

    await expect(fs.lstat(path.join(sandbox, 'site/agents/linked'))).rejects.toThrow()
    expect(await fs.readFile(path.join(sandbox, 'outside/keep.md'), 'utf-8')).toBe('outside')
  })

  it('drops a path hq supplied and derives its own, so nothing outside is removed', async () => {
    await handleAgentRemoveDirectory({ handle: 'scout', path: path.join(sandbox, 'outside') })

    await expect(fs.stat(path.join(sandbox, 'site/agents/scout'))).rejects.toThrow()
    expect(await fs.readFile(path.join(sandbox, 'outside/keep.md'), 'utf-8')).toBe('outside')
  })
})

describe('agent.promptPreview', () => {
  const SECTIONS = [
    { key: 'identity', label: 'Identity', content: 'You are Agent.', editable: false },
    { key: 'profile', label: 'Profile', content: '', editable: true },
  ]

  it('returns the flattened prompt and the sections it was built from (chat)', async () => {
    mockBuildChatSections.mockResolvedValue(SECTIONS)
    const result = await handleAgentPromptPreview({ agent: AGENT_CONFIG, sessionType: 'chat', packages: CONTEXT.packages })
    expect(result).toEqual({ prompt: 'You are Agent.', sections: SECTIONS })
  })

  it('builds a task preview from the task sections, skipping empty ones', async () => {
    mockBuildTaskSections.mockResolvedValue([
      { key: 'identity', label: 'Identity', content: 'You are Agent.', editable: false },
      { key: 'profile', label: 'Profile', content: '', editable: true },
      { key: 'task', label: 'Task', content: 'Do the thing.', editable: false },
    ])
    const result = await handleAgentPromptPreview({ agent: AGENT_CONFIG, sessionType: 'task', packages: CONTEXT.packages })
    expect(result.prompt).toBe('You are Agent.\n\n---\n\nDo the thing.')
    expect(result.sections).toHaveLength(3)
    expect(mockBuildChatSections).not.toHaveBeenCalled()
  })
})

// Integration-level proof that the deferred-manifest second frame must
// carry the run's TRUE terminal status,
// not an assumed COMPLETED — end to end through handleRunDispatch, not just
// reportDeferredManifestIfAny's own unit tests.
describe('deferred-manifest continuation carries the engine\'s true outcome', () => {
  // Deferred mode requires approval that is not bypassed; the mock engine
  // simulates PreToolUse populating the collector before resolving, since a
  // bare mock can't run real tool-gating logic itself.
  const DEFERRED_AGENT = { ...AGENT_CONFIG, approval: 'immediate' }
  const DEFERRED_PARAMS = { ...CHAT_DISPATCH_PARAMS, context: { ...CONTEXT, agent: DEFERRED_AGENT } }

  async function flush() {
    await new Promise(resolve => setImmediate(resolve))
  }

  it('a deferred run whose engine resolves FAILED sends a second status frame carrying FAILED, not COMPLETED', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    mockEngineRun.mockImplementation(async (_runId: string, options: { deferredManifest?: { tools: unknown[] } }) => {
      options.deferredManifest?.tools.push({ name: 'Bash', reason: 'needs it' })
      return { status: 'FAILED' }
    })

    await handleRunDispatch(DEFERRED_PARAMS)
    await flush()

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }))
  })

  it('the COMPLETED path is unchanged', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    mockEngineRun.mockImplementation(async (_runId: string, options: { deferredManifest?: { tools: unknown[] } }) => {
      options.deferredManifest?.tools.push({ name: 'Bash', reason: 'needs it' })
      return { status: 'COMPLETED' }
    })

    await handleRunDispatch(DEFERRED_PARAMS)
    await flush()

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }))
  })

  // A failure INSIDE reportDeferredManifestIfAny (the row update, here) must
  // be attributed to the report, not misdiagnosed
  // as the run itself having failed — a real run succeeded; only its approval
  // card was lost.
  it('a failure inside the deferred-manifest report is attributed to the report, not misdiagnosed as the run failing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockAgentRunUpdate.mockRejectedValue(new Error('db unavailable'))
      mockEngineRun.mockImplementation(async (_runId: string, options: { deferredManifest?: { tools: unknown[] } }) => {
        options.deferredManifest?.tools.push({ name: 'Bash', reason: 'needs it' })
        return { status: 'COMPLETED' }
      })

      await handleRunDispatch(DEFERRED_PARAMS)
      await flush()

      const messages = errorSpy.mock.calls.map(call => String(call[0]))
      expect(messages.some(m => m.includes('deferred-manifest report failed') && m.includes('approval card may be lost'))).toBe(true)
      expect(messages.some(m => /run [\w-]+ failed:/.test(m))).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
