import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { findUnique: vi.fn(), update: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
  },
  assembleRunLaunch: vi.fn(),
  waiting: vi.fn(),
}))

// AgentEngine needs prisma; no test here reaches a database.
vi.mock('#db', () => ({
  prisma: h.mockPrisma,
  HttpError: class HttpError extends Error {
    constructor(public statusCode: number, message: string) { super(message) }
  },
}))

// The seam these serialisation tests observe. `assembleRunLaunch` is the first
// thing `processRun` does and the last thing that happens before the run execs,
// so "this run entered the engine" and "this run has not entered yet" are both
// visible here without standing up a runtime, a container or a database.
vi.mock('../runLaunch', () => ({ assembleRunLaunch: h.assembleRunLaunch }))

vi.mock('../SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: vi.fn(), waiting: h.waiting } }))
vi.mock('../AgentContainerManager', () => ({
  agentContainerManager: { markRunStart: vi.fn(), markRunEnd: vi.fn() },
}))
vi.mock('../runPersistence', () => ({ persistRunOutput: vi.fn() }))
vi.mock('../currentSessionTitle', () => ({ readCurrentSessionTitle: vi.fn() }))
vi.mock('../../../server/runtime/runTokens', () => ({ revokeRunToken: vi.fn(), issueRunToken: vi.fn() }))
vi.mock('../../../server/hq/capabilityRenewClient', () => ({ renewCapabilityViaHq: vi.fn() }))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function () { return ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
  }) }),
}))

import { AgentEngine, maxConcurrentRuns } from '../AgentEngine'
import { runQueueKey } from '../runQueueKey'
import type { RunOptions } from '../types'

/**
 * ADR-0075: the only ordering between runs is within a conversation. A harness
 * transcript has one writer, so one session's turns share a key; nothing else
 * does — not two conversations in one container, not a task beside a chat.
 */
describe('the key runs are ordered on', () => {
  const base = { id: 'sess-1', userId: 'u1', sessionType: 'chat', taskId: null, primaryWorkspaceId: null }
  const inProject = { ...base, primaryOwnerType: 'project' as const, primaryOwnerId: 'proj-1' }

  it('is the same for two turns of one conversation', () => {
    expect(runQueueKey(inProject, 'run-a')).toBe(runQueueKey(inProject, 'run-b'))
  })

  it('differs between two conversations in one project, even for one person', () => {
    expect(runQueueKey(inProject, 'run-a'))
      .not.toBe(runQueueKey({ ...inProject, id: 'sess-2' }, 'run-b'))
  })

  it('differs between a task run and a chat turn in one project', () => {
    const task = { ...inProject, id: 'sess-task', sessionType: 'task', taskId: 't-1' }
    expect(runQueueKey(task, 'run-a'))
      .not.toBe(runQueueKey(inProject, 'run-b'))
  })

  it('gives a run with no session row a key of its own', () => {
    expect(runQueueKey(null, 'run-a')).not.toBe(runQueueKey(null, 'run-b'))
  })
})

/**
 * ADR-0075, in the engine: runs that share a container — one person's two
 * conversations, a task beside a chat — run together; the turns of one
 * conversation run one after another; the site-wide cap still bounds the whole.
 */
describe('runs in parallel, a conversation in order', () => {
  const runs = new Map<string, Record<string, unknown>>()
  const sessions = new Map<string, Record<string, unknown>>()
  /** Runs that reached `processRun`, in the order they got there. */
  let entered: string[]
  /** Per run: the promise `assembleRunLaunch` blocks on, and the release for it. */
  let gates: Map<string, { promise: Promise<void>; release: () => void }>
  /** The session row each run's launch was handed — see the threading cases below. */
  const launchedWith = new Map<string, unknown>()

  function gate(runId: string) {
    let release!: () => void
    const promise = new Promise<void>(resolve => { release = resolve })
    gates.set(runId, { promise, release })
  }

  /** A run row plus the session it belongs to, in the given storage boundary. */
  function seed(runId: string, sessionId: string, boundary: { ownerType: string; ownerId: string }) {
    runs.set(runId, { id: runId, status: 'PENDING', sessionId, taskId: null })
    sessions.set(sessionId, { id: sessionId, userId: 'u1', sessionType: 'chat', taskId: null,
      primaryOwnerType: boundary.ownerType, primaryOwnerId: boundary.ownerId, primaryWorkspaceId: null })
    gate(runId)
  }

  const DISPATCH_CONTEXT = {
    agent: { id: 'agent-1', handle: 'test-agent' },
  } as unknown as RunOptions['dispatchContext']

  function options(extra: Partial<RunOptions> = {}): RunOptions {
    return { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS, ...extra }
  }

  /** Long enough for every queued microtask — and any real work — to settle. */
  const settle = () => new Promise(resolve => { setTimeout(resolve, 50) })

  beforeEach(() => {
    vi.clearAllMocks()
    runs.clear()
    sessions.clear()
    entered = []
    gates = new Map()
    h.mockPrisma.agentRun.findUnique.mockImplementation(
      async ({ where }: any) => runs.get(where.id) ?? null,
    )
    h.mockPrisma.agentSession.findUnique.mockImplementation(
      async ({ where }: any) => sessions.get(where.id) ?? null,
    )
    launchedWith.clear()
    h.assembleRunLaunch.mockImplementation(
      async (runId: string, _o: unknown, _c: unknown, _s: unknown, _a: unknown, sessionRow: unknown) => {
        entered.push(runId)
        launchedWith.set(runId, sessionRow)
        await gates.get(runId)!.promise
        return { kind: 'skip' }
      },
    )
  })

  it('runs two conversations in one container at the same time', async () => {
    // One person, one project: the same container and the same Claude home,
    // two different sessions. The boundary queue used to run these in turn.
    seed('run-a', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    seed('run-b', 'sess-b', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const a = engine.run('run-a', options({ queued: true }))
    const b = engine.run('run-b', options({ queued: true }))

    await settle()
    expect(entered.sort()).toEqual(['run-a', 'run-b'])

    gates.get('run-a')!.release()
    gates.get('run-b')!.release()
    await Promise.all([a, b])
  })

  it('runs a task beside a chat turn in the same project', async () => {
    seed('run-chat', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    seed('run-task', 'sess-b', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const chat = engine.run('run-chat', options({ queued: true }))
    const task = engine.run('run-task', options({ queued: false }))

    await settle()
    expect(entered.sort()).toEqual(['run-chat', 'run-task'])

    gates.get('run-chat')!.release()
    gates.get('run-task')!.release()
    await Promise.all([chat, task])
  })

  it('keeps two turns of one conversation in order', async () => {
    // A harness transcript has one writer: the second turn waits for the first.
    seed('run-1', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    seed('run-2', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const first = engine.run('run-1', options({ queued: true }))
    const second = engine.run('run-2', options({ queued: true }))

    await settle()
    expect(entered).toEqual(['run-1'])

    gates.get('run-1')!.release()
    await first
    await settle()
    expect(entered).toEqual(['run-1', 'run-2'])

    gates.get('run-2')!.release()
    await second
  })

  it('keeps a task turn behind a chat turn of the same session, whichever path each came by', async () => {
    seed('run-1', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    seed('run-2', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const first = engine.run('run-1', options({ queued: true }))
    const second = engine.run('run-2', options({ queued: false }))

    await settle()
    expect(entered).toEqual(['run-1'])

    gates.get('run-1')!.release()
    await first
    await settle()
    expect(entered).toEqual(['run-1', 'run-2'])

    gates.get('run-2')!.release()
    await second
  })

  it('still bounds the whole site by the concurrent-run cap', async () => {
    // Five by default: a sixth conversation waits for a slot, not for a queue.
    const engine = new AgentEngine()
    const ids = ['1', '2', '3', '4', '5', '6']
    for (const id of ids) seed(`run-${id}`, `sess-${id}`, { ownerType: 'project', ownerId: 'proj-1' })

    const all = ids.map(id => engine.run(`run-${id}`, options({ queued: true })))
    await settle()
    expect(entered).toHaveLength(5)

    gates.get(entered[0])!.release()
    await settle()
    expect(entered).toHaveLength(6)

    for (const id of ids) gates.get(`run-${id}`)!.release()
    await Promise.all(all)
  })

  it('tells hq a run is waiting for a slot, and when it has one', async () => {
    process.env.AGENT_MAX_CONCURRENT_RUNS = '1'
    try {
      seed('run-a', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
      seed('run-b', 'sess-b', { ownerType: 'project', ownerId: 'proj-2' })
      sessions.get('sess-b')!.taskId = 't-b'
      const engine = new AgentEngine()

      const a = engine.run('run-a', options({ queued: true }))
      const b = engine.run('run-b', options({ queued: false }))
      await settle()
      // The first run got its slot at once and said nothing; the second waits.
      expect(h.waiting.mock.calls).toEqual([[{ runId: 'run-b', sessionId: 'sess-b', taskId: 't-b', waiting: true }]])

      gates.get('run-a')!.release()
      await a
      await settle()
      expect(h.waiting.mock.calls[1]).toEqual([{ runId: 'run-b', sessionId: 'sess-b', taskId: 't-b', waiting: false }])

      gates.get('run-b')!.release()
      await b
    } finally {
      delete process.env.AGENT_MAX_CONCURRENT_RUNS
    }
  })

  it('takes the cap from AGENT_MAX_CONCURRENT_RUNS', async () => {
    process.env.AGENT_MAX_CONCURRENT_RUNS = '1'
    try {
      seed('run-a', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
      seed('run-b', 'sess-b', { ownerType: 'project', ownerId: 'proj-2' })
      const engine = new AgentEngine()

      const a = engine.run('run-a', options({ queued: true }))
      const b = engine.run('run-b', options({ queued: true }))

      await settle()
      expect(entered).toEqual(['run-a'])

      gates.get('run-a')!.release()
      await a
      await settle()
      expect(entered).toEqual(['run-a', 'run-b'])

      gates.get('run-b')!.release()
      await b
    } finally {
      delete process.env.AGENT_MAX_CONCURRENT_RUNS
    }
  })

  it('falls back to the default cap on an unusable value', () => {
    process.env.AGENT_MAX_CONCURRENT_RUNS = ''
    try {
      expect(maxConcurrentRuns()).toBe(5)
      process.env.AGENT_MAX_CONCURRENT_RUNS = '2.5'
      expect(maxConcurrentRuns()).toBe(5)
      process.env.AGENT_MAX_CONCURRENT_RUNS = '8'
      expect(maxConcurrentRuns()).toBe(8)
    } finally {
      delete process.env.AGENT_MAX_CONCURRENT_RUNS
    }
  })

  /**
   * The queue key and the container are two uses of the same session fields,
   * separated by a wait that can run to minutes. They agreed only because site's
   * session upsert happens not to refresh the location — an invariant nothing
   * stated, nothing guarded and nothing tested, and one that a later change
   * making that upsert refresh the location would break silently, since no code
   * compares the two. One read removes the invariant instead of documenting it.
   */
  it('reads the session once and hands that same row down to the launch', async () => {
    seed('run-a', 'sess-a', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const a = engine.run('run-a', options({ queued: true }))
    await settle()

    expect(h.mockPrisma.agentSession.findUnique).toHaveBeenCalledTimes(1)
    // The identical object the key was derived from, not an equal one: nothing
    // downstream can be looking at a different version of this row.
    expect(launchedWith.get('run-a')).toBe(sessions.get('sess-a'))

    gates.get('run-a')!.release()
    await a
  })

  it('gives a run whose session cannot be read a queue of its own', async () => {
    // Its key is its own, so it waits for nothing and nothing waits for it — and
    // the same null reaches the launch, which refuses the run before any
    // container is prepared (resolveAgentContext, agentJob.test.ts).
    runs.set('run-orphan', { id: 'run-orphan', status: 'PENDING', sessionId: 'sess-gone', taskId: null })
    gate('run-orphan')
    seed('run-proj', 'sess-b', { ownerType: 'project', ownerId: 'proj-1' })
    const engine = new AgentEngine()

    const orphan = engine.run('run-orphan', options({ queued: true }))
    const proj = engine.run('run-proj', options({ queued: true }))

    await settle()
    expect(entered.sort()).toEqual(['run-orphan', 'run-proj'])
    expect(launchedWith.get('run-orphan')).toBeNull()

    gates.get('run-orphan')!.release()
    gates.get('run-proj')!.release()
    await Promise.all([orphan, proj])
  })
})
