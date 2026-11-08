/**
 * Tasks whose site went away, against the real database. A site that reconnects drains the tasks held for it
 * (@SC-340), each through the ordinary claim with what started it, and no other site's. A revoked site never
 * comes back, so the sweep fails what it held or ran (R-062, R-063): only its own tasks and those whose project
 * names no site, each write only while the task is still as read, its board told, hq's copy of the session
 * archived (R-059), and each freed (agent, project) slot handed on once, after every write.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpError } from 'wasp/server'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createUser, ensureExecutionSite } from '../../test/factories'
import { addTask, agentInProject, settle, stateOf } from './taskRunFixtures'
import { secondSite } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { TaskRunner } from '../TaskRunner'
import { failTasksForRevokedSite } from '../revokedSiteSweep'
import { HELD_FOR_RECONNECT_REASON, SITE_REVOKED_REASON, UNPLACEABLE_REASON } from '../taskExecutionReasons'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const HELD = { runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON }

/** Claimed and dispatched: the run is recorded on the task. */
const DISPATCHED = { runState: 'RUN_ACTIVE', runId: expect.any(String) }

/** Drains and sweeps start each task without waiting for it, so a start is polled for, not given a fixed time. */
const eventually = (check: () => Promise<void>) => vi.waitFor(check, { timeout: 5000, interval: 20 })

/** Two sites: the install's own (`here`) and a second (`there`), each with a project and an agent working in it. */
async function twoSites() {
  const here = await ensureExecutionSite()
  const there = await secondSite()
  const onHere = await agentInProject({ executionSiteId: here.id })
  const onThere = await agentInProject({ executionSiteId: there.id })
  return { here, there, onHere, onThere }
}

/** Tasks resolve to the site their project is on, as the real resolver does. */
async function placeOnTheirSites(...tasks: Array<{ id: string; projectId: string }>) {
  for (const t of tasks) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: t.projectId }, include: { executionSite: true } })
    dispatchFake.placeTask(t.id, project.executionSite ? project.executionSite.siteId : new HttpError(400, 'no site'))
  }
}

describe('drainHeldTasks @SC-340', () => {
  it("re-runs the tasks held for this site with what started them, and leaves another site's held", async () => {
    const { here, onHere, onThere } = await twoSites()
    const mine = await addTask(onHere, { ...HELD, runStartedBy: 'schedule' })
    const theirs = await addTask(onThere, { ...HELD, runStartedBy: 'person' })
    const queued = await addTask({ ...onHere, agent: await createAgent() })

    await new TaskRunner().drainHeldTasks(here.siteId)
    await eventually(async () => {
      expect(await stateOf(mine.id)).toMatchObject({ ...DISPATCHED, runStartedBy: 'schedule' })
    })
    expect(await stateOf(theirs.id)).toMatchObject(HELD)
    expect((await stateOf(queued.id)).runState).toBe('RUN_QUEUED')
    expect(dispatchFake.dispatchedTaskRuns.map(r => r.taskId)).toEqual([mine.id])
  })

  it("drains a personal project's held task on the site holding its person's storage", async () => {
    const { here, there } = await twoSites()
    const owner = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: owner.id, siteId: here.id } })
    const personal = await createProject({ name: 'Mine', personalOwnerId: owner.id, personalSpace: true, executionSiteId: null, accessLevel: 'PRIVATE' })
    const agent = await createAgent()
    const task = await addTask({ project: personal, agent, person: owner }, { ...HELD, runStartedBy: 'schedule' })

    await new TaskRunner().drainHeldTasks(there.siteId)
    await settle()
    expect(await stateOf(task.id)).toMatchObject(HELD)

    await new TaskRunner().drainHeldTasks(here.siteId)
    await eventually(async () => {
      expect(await stateOf(task.id)).toMatchObject({ ...DISPATCHED, runStartedBy: 'schedule' })
    })
  })

  it('never runs a held task no explicit act started: it is taken out of line instead (adr-0175)', async () => {
    const { here } = await twoSites()
    const owner = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: owner.id, siteId: here.id } })
    const personal = await createProject({ name: 'Mine', personalOwnerId: owner.id, personalSpace: true, executionSiteId: null, accessLevel: 'PRIVATE' })
    const task = await addTask({ project: personal, agent: await createAgent(), person: owner }, { ...HELD, runStartedBy: 'pulse' })

    await new TaskRunner().drainHeldTasks(here.siteId)
    await settle()
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_NONE', runStartedBy: null })
  })

  it('skips a held task with no agent', async () => {
    const { here, onHere } = await twoSites()
    const task = await addTask({ ...onHere, agent: null }, HELD)
    await new TaskRunner().drainHeldTasks(here.siteId)
    await settle()
    expect(await stateOf(task.id)).toMatchObject(HELD)
  })
})

describe('the revoked-site sweep', () => {
  it("fails the revoked site's running and held tasks, and those whose project names no site, and nothing else (R-063)", async () => {
    const { here, onHere, onThere } = await twoSites()
    const running = await addTask(onHere, { runState: 'RUN_ACTIVE' })
    const held = await addTask(onHere, HELD)
    const elsewhere = await addTask(onThere, { runState: 'RUN_ACTIVE' })
    const heldElsewhere = await addTask(onThere, HELD)
    const unplaced = await addTask(await agentInProject({ executionSiteId: null }), { runState: 'RUN_ACTIVE' })
    const queued = await addTask(onHere)
    await placeOnTheirSites(running, held, elsewhere, heldElsewhere, unplaced, queued)

    const triggerNext = vi.fn().mockResolvedValue(undefined)
    await failTasksForRevokedSite(here.siteId, triggerNext)

    expect(await stateOf(running.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: SITE_REVOKED_REASON })
    expect(await stateOf(held.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: SITE_REVOKED_REASON })
    expect(await stateOf(unplaced.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: UNPLACEABLE_REASON })
    expect((await stateOf(elsewhere.id)).runState).toBe('RUN_ACTIVE')
    expect(await stateOf(heldElsewhere.id)).toMatchObject(HELD)
    expect((await stateOf(queued.id)).runState).toBe('RUN_QUEUED')
    expect(dispatchFake.resolveSiteIdForTask).not.toHaveBeenCalledWith(elsewhere.id)
    // An unplaceable task's slot is freed too, or it would hold its agent's line for good.
    expect(triggerNext).toHaveBeenCalledWith(expect.objectContaining({ id: unplaced.assignedAgentId }), unplaced.projectId)
  })

  it("one task's failed write, or a failed archive, does not stop the rest of the sweep", async () => {
    const { here, onHere } = await twoSites()
    const other = await createProject({ name: 'Q', executionSiteId: here.id })
    const first = await addTask(onHere, { runState: 'RUN_ACTIVE' })
    const second = await addTask({ ...onHere, project: other }, { runState: 'RUN_ACTIVE' })
    const third = await addTask({ ...onHere, agent: await createAgent() }, { runState: 'RUN_ACTIVE' })
    for (const t of [first, second, third]) {
      await createSession({ agentId: onHere.agent.id, userId: onHere.person.id, sessionType: 'task', taskId: t.id })
    }
    await placeOnTheirSites(first, second, third)
    const write = vi.spyOn(prisma.task, 'updateMany').mockRejectedValueOnce(new Error('db blip'))
    const archive = vi.spyOn(prisma.agentSession, 'update').mockRejectedValueOnce(new Error('db blip'))
    const quiet = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})]
    const triggerNext = vi.fn().mockResolvedValue(undefined)
    try {
      await failTasksForRevokedSite(here.siteId, triggerNext)
    } finally {
      for (const spy of [write, archive, ...quiet]) spy.mockRestore()
    }

    // Whichever task the sweep reached first lost its write; the other two were failed and handed on.
    const states = await Promise.all([first, second, third].map(async t => (await stateOf(t.id)).runState))
    expect(states.filter(s => s === 'RUN_FAILED')).toHaveLength(2)
    expect(states.filter(s => s === 'RUN_ACTIVE')).toHaveLength(1)
    expect(triggerNext).toHaveBeenCalledTimes(2)
  })

  it('leaves a task whose site lookup fails for a passing reason, rather than failing it as unplaceable', async () => {
    const { here, onHere } = await twoSites()
    const running = await addTask(onHere, { runState: 'RUN_ACTIVE' })
    const held = await addTask(onHere, HELD)
    await placeOnTheirSites(held)
    dispatchFake.placeTask(running.id, new Error('connection reset'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    await failTasksForRevokedSite(here.siteId, vi.fn().mockResolvedValue(undefined))
    errorLog.mockRestore()

    expect((await stateOf(running.id)).runState).toBe('RUN_ACTIVE')
    expect((await stateOf(held.id)).runState).toBe('RUN_FAILED')
  })

  it('hands each freed (agent, project) slot on once, after every write, and only for a running task (R-062)', async () => {
    const { here, onHere } = await twoSites()
    const a2 = await createAgent()
    const otherProject = await createProject({ name: 'Q', executionSiteId: here.id })
    const tasks = [
      await addTask(onHere, { runState: 'RUN_ACTIVE' }),
      await addTask(onHere, { runState: 'RUN_ACTIVE' }),
      await addTask({ ...onHere, project: otherProject }, { runState: 'RUN_ACTIVE' }),
      await addTask({ ...onHere, agent: a2 }, { runState: 'RUN_ACTIVE' }),
      await addTask({ ...onHere, agent: a2, project: otherProject }, HELD),
    ]
    await placeOnTheirSites(...tasks)
    const seenAtTrigger: string[][] = []
    const triggerNext = vi.fn(async (_agent: { id: string }, _projectId: string | null) => {
      const rows = await prisma.task.findMany({ where: { id: { in: tasks.map(t => t.id) } }, select: { runState: true } })
      seenAtTrigger.push(rows.map(r => r.runState))
    })

    await failTasksForRevokedSite(here.siteId, triggerNext)

    expect(triggerNext).toHaveBeenCalledTimes(3)
    expect(triggerNext.mock.calls.map(([agent, projectId]) => `${agent.id}:${projectId}`).sort()).toEqual([
      `${onHere.agent.id}:${onHere.project.id}`, `${onHere.agent.id}:${otherProject.id}`, `${a2.id}:${onHere.project.id}`,
    ].sort())
    for (const states of seenAtTrigger) expect(states.every(s => s === 'RUN_FAILED')).toBe(true)
  })

  it('a failing hand-on does not stop the others', async () => {
    const { here, onHere } = await twoSites()
    const other = await createProject({ name: 'Q', executionSiteId: here.id })
    const tasks = [await addTask(onHere, { runState: 'RUN_ACTIVE' }), await addTask({ ...onHere, project: other }, { runState: 'RUN_ACTIVE' })]
    await placeOnTheirSites(...tasks)
    const triggerNext = vi.fn().mockRejectedValueOnce(new Error('db blip')).mockResolvedValue(undefined)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    await failTasksForRevokedSite(here.siteId, triggerNext)
    errorLog.mockRestore()

    expect(triggerNext).toHaveBeenCalledTimes(2)
  })

  it("a task a late terminal frame settled first is left as it is: no write, no board, no archive, no hand-on", async () => {
    const { here, onHere } = await twoSites()
    const board = await prisma.board.create({ data: { name: 'B', projectId: onHere.project.id } })
    const task = await addTask(onHere, { runState: 'RUN_ACTIVE', boardId: board.id })
    const session = await createSession({ agentId: onHere.agent.id, userId: onHere.person.id, sessionType: 'task', taskId: task.id })
    await placeOnTheirSites(task)
    // The frame lands between the sweep's read and its write.
    dispatchFake.resolveSiteIdForTask.mockImplementationOnce(async () => {
      await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_NONE' } })
      return here.siteId
    })
    socket.emitTaskUpdated.mockReset()
    const triggerNext = vi.fn().mockResolvedValue(undefined)

    await failTasksForRevokedSite(here.siteId, triggerNext)

    expect((await stateOf(task.id)).runState).toBe('RUN_NONE')
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ACTIVE')
    expect(triggerNext).not.toHaveBeenCalled()
  })

  it("tells the board of each task it failed, and archives hq's copy of its session — running or held (R-059)", async () => {
    const { here, onHere } = await twoSites()
    const board = await prisma.board.create({ data: { name: 'B', projectId: onHere.project.id } })
    const running = await addTask(onHere, { runState: 'RUN_ACTIVE', boardId: board.id })
    const held = await addTask(onHere, { ...HELD })
    const sessions = await Promise.all([running, held].map(t =>
      createSession({ agentId: onHere.agent.id, userId: onHere.person.id, sessionType: 'task', taskId: t.id })))
    await placeOnTheirSites(running, held)
    socket.emitTaskUpdated.mockReset()

    await failTasksForRevokedSite(here.siteId, vi.fn().mockResolvedValue(undefined))

    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    for (const s of sessions) expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('ARCHIVED')
    // hq's copy alone: the revoked site is never asked.
    expect(siteStore.archiveSession).not.toHaveBeenCalled()
  })

  it('leaves the session of a task failed as unplaceable alone — no site was revoked under it', async () => {
    const { here } = await twoSites()
    const unplaced = await agentInProject({ executionSiteId: null })
    const task = await addTask(unplaced, { runState: 'RUN_ACTIVE' })
    const session = await createSession({ agentId: unplaced.agent.id, userId: unplaced.person.id, sessionType: 'task', taskId: task.id })
    await placeOnTheirSites(task)

    await failTasksForRevokedSite(here.siteId, vi.fn().mockResolvedValue(undefined))

    expect((await stateOf(task.id)).runStateReason).toBe(UNPLACEABLE_REASON)
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ACTIVE')
  })

  it("TaskRunner's sweep starts the agent's next task asked for once a running task's slot is freed", async () => {
    const { here, onHere } = await twoSites()
    const running = await addTask(onHere, { runState: 'RUN_ACTIVE' })
    const next = await addTask(onHere, { runStartedBy: 'person' })
    await placeOnTheirSites(running)
    dispatchFake.placeTask(next.id, 'site-elsewhere')

    await new TaskRunner().failTasksForRevokedSite(here.siteId)

    expect((await stateOf(running.id)).runState).toBe('RUN_FAILED')
    await eventually(async () => {
      expect(await stateOf(next.id)).toMatchObject(DISPATCHED)
    })
  })
})
