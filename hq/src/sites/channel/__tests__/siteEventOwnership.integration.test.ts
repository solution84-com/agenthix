/**
 * Site event intake accepts a session's updates only from the site that owns
 * the session — where the session works, resolved as dispatch resolves it —
 * against the real test database. A failed owner lookup is retried before a
 * frame is dropped; a location that cannot be resolved is an answer, not a failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent } from '../../../test/factories'

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

import { handleSiteEvent, onRunStatus, __resetForTests } from '../siteEventHandler'
import * as activityFeed from '../../../test/fakes/activity'
import {
  personalSession, projectSession, sessionRow, statusEvent, streamEvent, installFakeIo, removeFakeIo, warnings, type FakeIo,
} from './siteEventFixtures'

let io: FakeIo
let warnSpy: MockInstance<typeof console.warn>
let lookups: MockInstance
let realFindUnique: (args: never) => Promise<unknown>

beforeEach(async () => {
  io = installFakeIo()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  realFindUnique = prisma.agentSession.findUnique.bind(prisma.agentSession) as never
  lookups = vi.spyOn(prisma.agentSession, 'findUnique')
})

afterEach(() => {
  removeFakeIo()
  vi.restoreAllMocks()
  __resetForTests()
})

const titleOf = async (id: string) => (await sessionRow(id)).title
const foreignWarnings = () => warnings(warnSpy).filter((w) => w.includes('belongs to site'))

/** Holds the next owner lookup until `release` is called; it then reads the real row. */
function holdNextLookup() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  lookups.mockImplementationOnce(((args: never) => gate.then(() => realFindUnique(args))) as never)
  return () => release()
}

describe('session updates are accepted only from the site that owns the session', () => {
  beforeEach(async () => {
    await projectSession('sess-1', 'site-owner')
  })

  it('drops a run.stream frame from a site that does not own the session, and warns', async () => {
    await handleSiteEvent('site-intruder', 'run.stream', streamEvent())
    expect(io.to).not.toHaveBeenCalled()
    expect(foreignWarnings()).toHaveLength(1)
  })

  // Ownership follows where the session works: drop a location column from the
  // lookup and a project's session resolves to someone's own storage instead.
  it('relays a run.stream frame from the site holding the project the session works in', async () => {
    await handleSiteEvent('site-owner', 'run.stream', streamEvent())
    expect(io.to).toHaveBeenCalledWith('session:sess-1')
  })

  it('a run.status frame from a non-owning site writes no session patch, emits nothing, but still runs listeners', async () => {
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('ownership-test', listener)

    const event = statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'hijacked', totalInputTokens: 99 } })
    await handleSiteEvent('site-intruder', 'run.status', event)

    expect(await sessionRow('sess-1')).toMatchObject({ title: 'New Conversation', totalInputTokens: 0 })
    expect(io.emit).not.toHaveBeenCalled()
    expect(activityFeed.recordActivity).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledWith(event, 'site-intruder')
  })

  it('warns once per foreign site for a session, however many frames it sends, and again for a different foreign site', async () => {
    for (let i = 0; i < 5; i++) await handleSiteEvent('site-intruder', 'run.stream', streamEvent())
    expect(foreignWarnings()).toHaveLength(1)

    await handleSiteEvent('site-other-intruder', 'run.stream', streamEvent())
    expect(foreignWarnings()).toHaveLength(2)
  })

  it("a non-owning site's terminal frame does not latch the run — the owner's terminal frame still applies", async () => {
    await handleSiteEvent('site-intruder', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'x' } }))
    await handleSiteEvent('site-owner', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'real' } }))

    expect(await titleOf('sess-1')).toBe('real')
  })

  // These send frames from BOTH sites while one lookup is still open — the state
  // in which a shared cached promise could be credited to whichever frame asked first.
  it('an owner and an intruder speaking during one pending lookup share it, and only the owner is relayed', async () => {
    const release = holdNextLookup()
    const fromIntruder = handleSiteEvent('site-intruder', 'run.stream', streamEvent({ data: { textDelta: 'intruder' } }))
    const fromOwner = handleSiteEvent('site-owner', 'run.stream', streamEvent({ data: { textDelta: 'owner' } }))
    await vi.waitFor(() => expect(lookups).toHaveBeenCalledTimes(1))
    // Both frames are waiting on the lookup: nothing has been decided yet.
    expect(io.to).not.toHaveBeenCalled()

    release()
    await Promise.all([fromIntruder, fromOwner])

    expect(lookups).toHaveBeenCalledTimes(1)
    expect(io.to).toHaveBeenCalledExactlyOnceWith('session:sess-1')
    expect(io.emit).toHaveBeenCalledExactlyOnceWith('agentStreamDelta', { runId: 'run-1', textDelta: 'owner' })
    expect(foreignWarnings()).toHaveLength(1)
    expect(foreignWarnings()[0]).toContain('site-intruder')
  })

  it("an intruder's terminal frame arriving first, while the lookup is pending, does not latch the run against the owner's", async () => {
    const release = holdNextLookup()

    const fromIntruder = handleSiteEvent('site-intruder', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'hijacked' } }))
    const fromOwner = handleSiteEvent('site-owner', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'real' } }))
    await vi.waitFor(() => expect(lookups).toHaveBeenCalledTimes(1))

    release()
    await Promise.all([fromIntruder, fromOwner])

    expect(lookups).toHaveBeenCalledTimes(1)
    expect(await titleOf('sess-1')).toBe('real')
    expect(io.emit.mock.calls.filter(([name]) => name === 'agentRunStatus')).toHaveLength(1)
  })

  it('drops a run.status session patch for a session hq has no copy of', async () => {
    await handleSiteEvent('site-owner', 'run.status', statusEvent({ sessionId: 'ghost', sessionPatch: { title: 'x' } }))
    expect(io.emit).not.toHaveBeenCalled()
    expect(await prisma.agentSession.count()).toBe(1)
  })
})

describe("a site that owns a different session cannot latch another site's run by naming that runId", () => {
  it("the owner's terminal frame still applies", async () => {
    // Two sessions of the SAME agent, working in projects on different sites —
    // exactly the case an agent-keyed resolution could not tell apart.
    const agent = await createAgent()
    await projectSession('sess-1', 'site-a', agent.id)
    await projectSession('sess-2', 'site-b', agent.id)

    await handleSiteEvent('site-b', 'run.status', statusEvent({ sessionId: 'sess-2', runId: 'run-1', status: 'COMPLETED' }))
    await handleSiteEvent('site-a', 'run.status', statusEvent({ sessionId: 'sess-1', runId: 'run-1', status: 'COMPLETED', sessionPatch: { title: 'real' } }))

    expect(await titleOf('sess-1')).toBe('real')
    // One status for each session: site-b's frame for its own session did not latch sess-1's run.
    expect(io.emit.mock.calls.filter(([name]) => name === 'agentRunStatus')).toHaveLength(2)
    expect(io.to).toHaveBeenCalledWith('session:sess-2')
    expect(io.to).toHaveBeenCalledWith('session:sess-1')
    expect(io.emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'COMPLETED', error: undefined })
  })
})

// The retry pauses (50 ms, then 200 ms) run on the real clock: a quarter second
// at most per test, and the database driver keeps its own timers.
describe('a failed session-owner lookup is retried before a frame is dropped', () => {
  beforeEach(async () => {
    await personalSession('sess-1')
  })

  it('applies a terminal frame when the owner lookup fails once and then succeeds', async () => {
    lookups.mockRejectedValueOnce(new Error('connection reset'))

    await handleSiteEvent('site-1', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'final' } }))

    expect(lookups).toHaveBeenCalledTimes(2)
    expect(await titleOf('sess-1')).toBe('final')
    expect(io.emit.mock.calls.filter(([name]) => name === 'agentRunStatus')).toHaveLength(1)
    expect(io.emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'COMPLETED', error: undefined })
  })

  it('drops the frame after three failed lookups, logs it as a lookup failure rather than a foreign frame, and caches nothing', async () => {
    for (let i = 0; i < 3; i++) lookups.mockRejectedValueOnce(new Error('connection reset'))

    await handleSiteEvent('site-1', 'run.status', statusEvent({ runId: 'run-1', status: 'COMPLETED', sessionPatch: { title: 'final' } }))

    expect(lookups).toHaveBeenCalledTimes(3)
    expect(await titleOf('sess-1')).toBe('New Conversation')
    expect(warnings(warnSpy).some((w) => w.includes('owner lookup for session sess-1 failed after 3 attempts'))).toBe(true)
    expect(foreignWarnings()).toEqual([])

    await handleSiteEvent('site-1', 'run.status', statusEvent({ runId: 'run-2', status: 'COMPLETED', sessionPatch: { title: 'final' } }))

    expect(lookups).toHaveBeenCalledTimes(4)
    expect(await titleOf('sess-1')).toBe('final')
  })

  it('concurrent frames for one session share the retrying lookup — three attempts in all, not three each — and cache nothing', async () => {
    for (let i = 0; i < 3; i++) lookups.mockRejectedValueOnce(new Error('connection reset'))

    await Promise.all([
      handleSiteEvent('site-1', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'final' } })),
      handleSiteEvent('site-1', 'run.stream', streamEvent()),
    ])

    expect(lookups).toHaveBeenCalledTimes(3)
    expect(await titleOf('sess-1')).toBe('New Conversation')
    expect(io.emit).not.toHaveBeenCalled()

    await handleSiteEvent('site-1', 'run.stream', streamEvent())

    expect(lookups).toHaveBeenCalledTimes(4)
    expect(io.emit).toHaveBeenCalledTimes(1)
  })

  // A refusal is an ANSWER: the location is unplaced, and asking again in 50 ms
  // cannot change that. Retrying would spend a quarter second per frame, forever.
  it('drops a frame whose session location cannot be resolved without retrying, and caches the answer', async () => {
    await prisma.agentSession.update({
      where: { id: 'sess-1' },
      data: { primaryOwnerType: 'user', primaryOwnerId: (await sessionRow('sess-1')).userId, primaryWorkspaceId: 'ws-never-placed' },
    })

    await handleSiteEvent('site-1', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'final' } }))

    expect(lookups).toHaveBeenCalledTimes(1)
    expect(await titleOf('sess-1')).toBe('New Conversation')
    expect(warnings(warnSpy).some((w) => w.includes('its location cannot be resolved'))).toBe(true)
    expect(warnings(warnSpy).some((w) => w.includes('failed after 3 attempts'))).toBe(false)

    // Cached, so a second frame for the same session costs no lookup at all.
    await handleSiteEvent('site-1', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'final' } }))
    expect(lookups).toHaveBeenCalledTimes(1)
  })
})
