/**
 * Site event intake that writes hq's rows, against the real test database and
 * the real resolution dispatch uses: which site owns a session (the
 * lookup is cached, and a placement change must not be invisible to it), and
 * the `session.patch` and `run.waiting` frames, which only the owning site may send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createAgent, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { sessionOwnedBy, __resetSessionOwnerCacheForTests, OWNER_RECHECK_MIN_MS } from '../sessionOwnerSite'
import { handleSessionPatch } from '../sessionPatchEvent'
import { handleRunWaiting } from '../runWaitingEvent'
import { SLOT_TAKEN_REASON } from '../../../agents/taskSlotClaim'
import { WAITING_FOR_SLOT_REASON, WAITING_FOR_BRANCH_REASON } from '../../../agents/taskExecutionReasons'

let seq = 0
function makeSite() {
  seq++
  return prisma.executionSite.create({ data: { siteId: `site-${seq}`, label: `Site ${seq}`, credentialHash: 'h'.repeat(64) } })
}

/** A chat session working in a project's files, so its owning site is the project's. */
async function chatInProjectOn(site: { id: string }) {
  const project = await createProject({ executionSiteId: site.id })
  const session = await prisma.agentSession.create({
    data: {
      userId: (await createUser()).id, agentId: (await createAgent()).id,
      sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: project.id,
    },
  })
  return { project, session }
}

const emit = vi.fn()
const to = vi.fn(() => ({ emit }))
beforeEach(() => {
  vi.clearAllMocks()
  __resetSessionOwnerCacheForTests()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = { to }
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__
})

describe('a session whose placement changes', () => {
  // Only the clock the cache reads; the database driver keeps real timers.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
  const lookups = () => vi.spyOn(prisma.agentSession, 'findUnique')

  async function moveTo(sessionId: string, site: { id: string }) {
    const project = await createProject({ executionSiteId: site.id })
    await prisma.agentSession.update({ where: { id: sessionId }, data: { primaryOwnerId: project.id } })
  }

  it("accepts the new site's frames straight away once the session has moved", async () => {
    const [oldSite, newSite] = [await makeSite(), await makeSite()]
    const { session } = await chatInProjectOn(oldSite)
    const findUnique = lookups()
    expect(await sessionOwnedBy(session.id, oldSite.siteId)).toBe(true)
    vi.advanceTimersByTime(OWNER_RECHECK_MIN_MS)

    await moveTo(session.id, newSite)

    expect(await sessionOwnedBy(session.id, newSite.siteId)).toBe(true)
    expect(await sessionOwnedBy(session.id, oldSite.siteId)).toBe(false)
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it('accepts a session that did not exist when a frame for it was first refused', async () => {
    const site = await makeSite()
    const project = await createProject({ executionSiteId: site.id })

    expect(await sessionOwnedBy('sess-late', site.siteId)).toBe(false)
    vi.advanceTimersByTime(OWNER_RECHECK_MIN_MS)
    await prisma.agentSession.create({
      data: {
        id: 'sess-late', userId: (await createUser()).id, agentId: (await createAgent()).id,
        sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: project.id,
      },
    })

    expect(await sessionOwnedBy('sess-late', site.siteId)).toBe(true)
  })

  it('a burst of refused frames shares one fresh lookup, and each is judged by it', async () => {
    const [oldSite, newSite] = [await makeSite(), await makeSite()]
    const { session } = await chatInProjectOn(oldSite)
    const findUnique = lookups()
    expect(await sessionOwnedBy(session.id, oldSite.siteId)).toBe(true)
    vi.advanceTimersByTime(OWNER_RECHECK_MIN_MS)
    await moveTo(session.id, newSite)

    const results = await Promise.all([1, 2, 3].map(() => sessionOwnedBy(session.id, newSite.siteId)))

    expect(results).toEqual([true, true, true])
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it('a site that does not own the session re-asks at most once per interval, not once per frame', async () => {
    const [site, intruder] = [await makeSite(), await makeSite()]
    const { session } = await chatInProjectOn(site)
    const findUnique = lookups()
    expect(await sessionOwnedBy(session.id, site.siteId)).toBe(true)
    for (let i = 0; i < 5; i++) expect(await sessionOwnedBy(session.id, intruder.siteId)).toBe(false)
    expect(findUnique).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(OWNER_RECHECK_MIN_MS)
    for (let i = 0; i < 5; i++) expect(await sessionOwnedBy(session.id, intruder.siteId)).toBe(false)
    expect(findUnique).toHaveBeenCalledTimes(2)
  })
})

describe('session.patch intake', () => {
  const close = (sessionId: string, closedReason = 'LEFT_PROJECT') => ({ sessionId, sessionPatch: { status: 'CLOSED', closedReason } })

  it("closes hq's copy with the site's reason, for a session the site owns", async () => {
    const site = await makeSite()
    const { session } = await chatInProjectOn(site)

    await handleSessionPatch(site.siteId, close(session.id))

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
  })

  it('applies nothing from a site that does not own the session', async () => {
    const [site, other] = [await makeSite(), await makeSite()]
    const { session } = await chatInProjectOn(site)

    await handleSessionPatch(other.siteId, close(session.id))

    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ACTIVE')
  })

  it.each([
    ['no session id', (_id: string) => ({ sessionPatch: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } })],
    ['a status other than CLOSED', (id: string) => ({ sessionId: id, sessionPatch: { status: 'ACTIVE' } })],
    ['an unknown reason', (id: string) => close(id, 'BORED')],
    ['no patch', (id: string) => ({ sessionId: id })],
  ])('drops a frame with %s', async (_what, frame) => {
    const site = await makeSite()
    const { session } = await chatInProjectOn(site)

    await handleSessionPatch(site.siteId, frame(session.id))

    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ACTIVE')
  })
})

describe('run.waiting intake', () => {
  async function runningTask(site: { id: string }, runStateReason: string | null = 'execution slot available') {
    const project = await createProject({ executionSiteId: site.id })
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id } })
    return createTestTask({
      data: { title: 't', projectId: project.id, boardId: board.id, number: 1, onBehalfOfUserId: 'person-1', runState: 'RUN_ACTIVE', runStateReason },
    })
  }
  const reasonOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).runStateReason
  const waiting = (taskId: string | null, flag?: boolean) => ({ runId: 'r1', sessionId: 's1', taskId, ...(flag === undefined ? {} : { waiting: flag }) })

  it('sets the reason on a running task whose run is waiting for a slot, and tells its board', async () => {
    const site = await makeSite()
    const task = await runningTask(site)

    await handleRunWaiting(site.siteId, waiting(task.id, true))

    expect(await reasonOf(task.id)).toBe(WAITING_FOR_SLOT_REASON)
    expect(to).toHaveBeenCalledWith(`board:${task.boardId}`)
  })

  it('changes nothing and tells no board when the task is not running', async () => {
    const site = await makeSite()
    const task = await runningTask(site)
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_FAILED' } })

    await handleRunWaiting(site.siteId, waiting(task.id, true))

    expect(await reasonOf(task.id)).toBe('execution slot available')
    expect(to).not.toHaveBeenCalled()
  })

  it('clears it once the run has its slot, but only while it is the reason', async () => {
    const site = await makeSite()
    const waitingTask = await runningTask(site, WAITING_FOR_SLOT_REASON)
    const otherReason = await runningTask(site, 'something else')

    await handleRunWaiting(site.siteId, waiting(waitingTask.id, false))
    await handleRunWaiting(site.siteId, waiting(otherReason.id, false))

    expect(await reasonOf(waitingTask.id)).toBe(SLOT_TAKEN_REASON)
    expect(await reasonOf(otherReason.id)).toBe('something else')
  })

  it('says a run on a branch waits for the project\'s other runs, and clears only that reason when it starts', async () => {
    const site = await makeSite()
    const task = await runningTask(site)

    await handleRunWaiting(site.siteId, { ...waiting(task.id, true), reason: 'branch' })
    expect(await reasonOf(task.id)).toBe(WAITING_FOR_BRANCH_REASON)
    await handleRunWaiting(site.siteId, { ...waiting(task.id, false), reason: 'branch' })
    expect(await reasonOf(task.id)).toBe(SLOT_TAKEN_REASON)
  })

  it('applies nothing from a site that does not own the task', async () => {
    const [site, other] = [await makeSite(), await makeSite()]
    const task = await runningTask(site)

    await handleRunWaiting(other.siteId, waiting(task.id, true))

    expect(await reasonOf(task.id)).toBe('execution slot available')
  })

  it.each([
    ['a chat run, which has no task', (_id: string) => waiting(null, true)],
    ['no waiting flag', (id: string) => waiting(id)],
    ['no data', () => null],
  ])('drops a frame for %s', async (_what, frame) => {
    const site = await makeSite()
    const task = await runningTask(site)

    await handleRunWaiting(site.siteId, frame(task.id))

    expect(await reasonOf(task.id)).toBe('execution slot available')
  })
})
