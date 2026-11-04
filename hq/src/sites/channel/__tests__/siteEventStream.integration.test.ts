/**
 * `run.stream` intake (siteEventHandler.ts) against the real test database: a
 * frame from the site that owns the session is relayed into the browser's room;
 * anything malformed, or for a session hq has no copy of, is
 * dropped before it reaches a browser (SC-355). The owner lookup is cached.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
// The real task runner registers itself on this handler as it loads, which would
// load it in the middle of loading the handler; it is not what these tests are about.
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { handleSiteEvent, __resetForTests } from '../siteEventHandler'
import { personalSession, taskSession, streamEvent, installFakeIo, removeFakeIo, type FakeIo } from './siteEventFixtures'

let io: FakeIo
let warnSpy: MockInstance<typeof console.warn>
let lookups: MockInstance
let realFindUnique: (args: never) => Promise<unknown>

beforeEach(async () => {
  io = installFakeIo()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await personalSession('sess-1')
  realFindUnique = prisma.agentSession.findUnique.bind(prisma.agentSession) as never
  // Counts the owner lookups; each still reads the real row.
  lookups = vi.spyOn(prisma.agentSession, 'findUnique')
})

afterEach(() => {
  removeFakeIo()
  vi.restoreAllMocks()
  vi.useRealTimers()
  __resetForTests()
})

describe('site event intake — run.stream @SC-343', () => {
  it("relays to the session room under the original name, as hq's declared event", async () => {
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ data: { runId: 'run-1', textDelta: 'hi', extra: true } }))
    expect(io.to).toHaveBeenCalledWith('session:sess-1')
    expect(io.emit).toHaveBeenCalledWith('agentStreamDelta', { runId: 'run-1', textDelta: 'hi' })
  })

  it("drops a frame a client relies on whose data no longer fits hq's event, and warns", async () => {
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ data: { text: 'renamed on the site' } }))
    expect(io.emit).not.toHaveBeenCalled()
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('does not fit')
  })

  it('relays to the task room when targetRoom is task and taskId is set', async () => {
    const { task } = await taskSession('sess-task')
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'sess-task', targetRoom: 'task', taskId: task.id }))
    expect(io.to).toHaveBeenCalledWith(`task:${task.id}`)
  })

  it("drops a frame that names a task room other than its session's task", async () => {
    const { task } = await taskSession('sess-task')
    const { task: other } = await taskSession('sess-other-task')
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'sess-task', targetRoom: 'task', taskId: other.id }))
    expect(io.to).not.toHaveBeenCalled()
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'sess-task', targetRoom: 'task', taskId: task.id }))
    expect(io.to).toHaveBeenCalledWith(`task:${task.id}`)
  })

  it('passes a taskSessionStarted frame carrying runId: null — it fires before the run row exists, by design', async () => {
    const { task } = await taskSession('sess-task')
    await handleSiteEvent('site-1', 'run.stream', streamEvent({
      sessionId: 'sess-task', name: 'taskSessionStarted', runId: null, targetRoom: 'task', taskId: task.id, data: { sessionId: 'sess-task' },
    }))
    expect(io.to).toHaveBeenCalledWith(`task:${task.id}`)
    expect(io.emit).toHaveBeenCalledWith('taskSessionStarted', { sessionId: 'sess-task' })
  })
})

// SC-355: hq validates every run.stream frame at intake, before ANY of it
// reaches a socket.io room.
describe('run.stream intake validation @SC-355', () => {
  it.each([
    // `as never`: these frames are malformed on purpose, outside the wire type.
    ['an unknown event name', streamEvent({ name: 'somethingElse' as never })],
    // hq synthesizes agentRunStatus itself from run.status; a site sending it too would double-deliver it.
    ['the name agentRunStatus', streamEvent({ name: 'agentRunStatus' as never })],
    // A task-room frame with no taskId is malformed, not a case to redirect to the session room.
    ['a task room but no taskId', streamEvent({ targetRoom: 'task', taskId: null })],
  ])('drops a frame with %s, and warns', async (_what, frame) => {
    await handleSiteEvent('site-1', 'run.stream', frame)
    expect(io.to).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('drops a frame for a sessionId hq has no copy of, and caches the negative result (no second lookup)', async () => {
    await handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'ghost-session' }))
    expect(io.to).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    expect(lookups).toHaveBeenCalledTimes(1)

    await handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'ghost-session' }))
    expect(io.to).not.toHaveBeenCalled()
    expect(lookups).toHaveBeenCalledTimes(1)
  })

  // The cache holds the PROMISE, so a positive result is just as cache-hit-able as a negative one.
  it('caches a positive result — a second frame for the same session costs no second lookup', async () => {
    await handleSiteEvent('site-1', 'run.stream', streamEvent())
    await handleSiteEvent('site-1', 'run.stream', streamEvent())
    expect(io.to).toHaveBeenCalledTimes(2)
    expect(lookups).toHaveBeenCalledTimes(1)
  })

  it('re-fetches once the cached entry\'s TTL has expired', async () => {
    // Only the clock the cache reads; the database driver keeps real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    await handleSiteEvent('site-1', 'run.stream', streamEvent())
    expect(lookups).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000 + 1)

    await handleSiteEvent('site-1', 'run.stream', streamEvent())
    expect(lookups).toHaveBeenCalledTimes(2)
  })

  // F1: concurrent frames for one cold-cache session all wait on the same
  // lookup, so they resume, and relay, in the order they arrived.
  it('serializes concurrent frames for the same cold-cache session — relayed in arrival order, one lookup', async () => {
    await personalSession('cold-session')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    lookups.mockImplementationOnce(((args: never) => gate.then(() => realFindUnique(args))) as never)
    const order: string[] = []
    io.emit.mockImplementation((name: string) => {
      order.push(`${io.to.mock.calls.at(-1)?.[0]}:${name}`)
    })

    const frames = ['agentStreamDelta', 'agentToolCall', 'agentThinking'].map((name) =>
      handleSiteEvent('site-1', 'run.stream', streamEvent({ sessionId: 'cold-session', name: name as never, data: { textDelta: 'x' } })))
    release()
    await Promise.all(frames)

    expect(lookups).toHaveBeenCalledTimes(1)
    expect(order).toEqual([
      'session:cold-session:agentStreamDelta',
      'session:cold-session:agentToolCall',
      'session:cold-session:agentThinking',
    ])
  })
})
