/**
 * How a task comes to be queued, against the real test DB (adr-0089, adr-0091,
 * spec §3 and §6). Every path that queues a task writes who queued it and how
 * deep in a chain of agent-queued work it is; a boundary whose throttle is on
 * holds it for the next round; a column never queues a task with no agent or
 * one whose time is still to come; a move never changes a run state except to
 * queue or withdraw; and the task's board is told when that happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../test/factories'
import { ctx, makeBoard, makeTask } from './projectsHarness'

const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { createTask, moveTaskToColumn } from '../taskService'
import { applyAutoQueueChange } from '../autoQueueColumns'
import { applyMoveToRunState } from '../taskRunMoves'
import { updateTask as updateTaskAction } from '../actions'
import { originByAgentRun, originByPerson, personQueuer } from '../taskOnBehalfOf'
import * as activityFeed from '../../test/fakes/activity'

beforeEach(() => socket.emitTaskUpdated.mockClear())

const COLUMNS = [
  { name: 'ready', label: 'Ready', status: 'TODO', order: 0, color: 'x', autoQueue: true },
  { name: 'review', label: 'Review', status: 'IN_PROGRESS', order: 1, color: 'x' },
  { name: 'done', label: 'Done', status: 'DONE', order: 2, color: 'x' },
  { name: 'shipped', label: 'Shipped', status: 'DONE', order: 3, color: 'x' },
]

async function cast(opts: { throttle?: boolean } = {}) {
  const dana = await createUser()
  const agent = await createAgent()
  const project = await createProject({ key: 'PRJ' })
  if (opts.throttle) await prisma.projectAutomation.create({ data: { projectId: project.id, throttle: true } })
  const board = await makeBoard(project.id, { columns: COLUMNS })
  return { dana, agent, project, board }
}
const fresh = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const queuedBy = (t: { queuedByUserId: string | null; queuedByAgentId: string | null; queuedBySessionId: string | null }) =>
  ({ user: t.queuedByUserId, agent: t.queuedByAgentId, session: t.queuedBySessionId })

describe('createTask records who it is for, and who queued it when it lands queued', () => {
  it('created queued by an agent: records the agent and its run\'s session, at the depth it queues at', async () => {
    const { dana, agent, project } = await cast()
    const task = await createTask({
      title: 'T', projectId: project.id, assignedAgentId: agent.id, queue: true, origin: originByAgentRun(dana.id, agent.id, 's1'), queueDepth: 2,
    })
    const row = await fresh(task.id)
    expect(row).toMatchObject({ onBehalfOfUserId: dana.id, runState: 'RUN_QUEUED', runStartedBy: null, queueDepth: 2 })
    expect(queuedBy(row)).toEqual({ user: null, agent: agent.id, session: 's1' })
    expect(task.runState).toBe('RUN_QUEUED')
  })

  it('created idle: records who it is for, and no queuer — nobody has queued it', async () => {
    const { dana, agent, project } = await cast()
    const task = await createTask({ title: 'T', projectId: project.id, assignedAgentId: agent.id, origin: originByPerson(dana.id) })
    const row = await fresh(task.id)
    expect(row).toMatchObject({ onBehalfOfUserId: dana.id, runState: 'RUN_NONE' })
    expect(queuedBy(row)).toEqual({ user: null, agent: null, session: null })
  })

  it('landing in an auto-queue column queues it, written with its queuer; landing in a done column or the Backlog never does', async () => {
    const { dana, agent, project, board } = await cast()
    const ready = await createTask({ title: 'T', projectId: project.id, boardId: board.id, column: 'ready', assignedAgentId: agent.id, origin: originByAgentRun(dana.id, agent.id, 's1') })
    const backlog = await createTask({ title: 'B', projectId: project.id, boardId: board.id, assignedAgentId: agent.id, origin: originByPerson(dana.id) })
    const done = await createTask({ title: 'D', projectId: project.id, boardId: board.id, column: 'done', assignedAgentId: agent.id, queue: true, origin: originByPerson(dana.id) })
    expect(queuedBy(await fresh(ready.id))).toEqual({ user: null, agent: agent.id, session: 's1' })
    expect((await fresh(ready.id)).runState).toBe('RUN_QUEUED')
    expect((await fresh(done.id)).runState).toBe('RUN_NONE')
    // The Backlog starts nothing, ahead of a column that would.
    expect(await fresh(backlog.id)).toMatchObject({ column: null, runState: 'RUN_NONE' })
  })

  it('numbers tasks per project, from 1 @SC-032', async () => {
    const { dana, project } = await cast()
    const other = await createProject()
    const a = await createTask({ title: 'A', projectId: project.id, origin: originByPerson(dana.id) })
    const b = await createTask({ title: 'B', projectId: project.id, origin: originByPerson(dana.id) })
    const c = await createTask({ title: 'C', projectId: other.id, origin: originByPerson(dana.id) })
    expect([a.number, b.number, c.number]).toEqual([1, 2, 1])
  })
})

describe('the other queueing paths', () => {
  // SC-033: a person queues by Run, not by an edit.
  it('editing a task never changes its run state or who queued it, whatever the edit carries @SC-033', async () => {
    const { agent, project } = await cast()
    const operator = await createUserWithRole('MEMBER')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: operator.id } })
    const task = await makeTask(project.id, { assignedAgentId: agent.id })
    await updateTaskAction({ taskId: task.id, title: 'x', runState: 'RUN_ACTIVE', runStateReason: 'forged' } as any, ctx(operator))
    expect(await fresh(task.id)).toMatchObject({ title: 'x', runState: 'RUN_NONE', runStateReason: null })
    expect(queuedBy(await fresh(task.id))).toEqual({ user: null, agent: null, session: null })
  })

  it('a move into an auto-queue column records who queued it and the depth — moving an old task back never resets it', async () => {
    const { dana, agent, project, board } = await cast()
    const task = await makeTask(project.id, { boardId: board.id, column: 'done', status: 'DONE', assignedAgentId: agent.id })
    await moveTaskToColumn({ taskId: task.id, column: 'ready', boardId: board.id, queuer: personQueuer(dana.id), queueDepth: 3 })
    const row = await fresh(task.id)
    expect(row).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 3 })
    expect(queuedBy(row)).toEqual({ user: dana.id, agent: null, session: null })
  })

  it("turning a stage's auto-queue on queues its idle assigned tasks as the person who did; turning it off releases only what the column queued", async () => {
    const { dana, agent, project, board } = await cast()
    const idle = await makeTask(project.id, { boardId: board.id, column: 'review', assignedAgentId: agent.id })
    const unassigned = await makeTask(project.id, { boardId: board.id, column: 'review' })
    const asked = await makeTask(project.id, { boardId: board.id, column: 'review', assignedAgentId: agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person' })

    await applyAutoQueueChange(board.id, project.id, { newlyEnabled: ['review'], newlyDisabled: [] }, personQueuer(dana.id))
    expect(queuedBy(await fresh(idle.id))).toEqual({ user: dana.id, agent: null, session: null })
    expect((await fresh(idle.id)).runState).toBe('RUN_QUEUED')
    expect((await fresh(unassigned.id)).runState).toBe('RUN_NONE')

    await applyAutoQueueChange(board.id, project.id, { newlyEnabled: [], newlyDisabled: ['review'] }, personQueuer(dana.id))
    expect((await fresh(idle.id)).runState).toBe('RUN_NONE')
    expect((await fresh(asked.id)).runState).toBe('RUN_QUEUED')
  })

  it('in a boundary whose throttle is on, a task queued for the pulse waits for the next round', async () => {
    const { dana, agent, project, board } = await cast({ throttle: true })
    const task = await makeTask(project.id, { boardId: board.id, column: 'review', assignedAgentId: agent.id })
    await moveTaskToColumn({ taskId: task.id, column: 'ready', boardId: board.id, queuer: personQueuer(dana.id) })
    expect((await fresh(task.id)).runState).toBe('RUN_THROTTLED')
  })
})

describe('a move never changes the run state, except to queue or withdraw (spec §6)', () => {
  it('a running task stays running when moved, even into an auto-queue column', async () => {
    const { agent, project, board } = await cast()
    const task = await makeTask(project.id, { boardId: board.id, column: 'review', assignedAgentId: agent.id, runState: 'RUN_ACTIVE', runStateReason: 'going' })
    await moveTaskToColumn({ taskId: task.id, column: 'ready', boardId: board.id })
    expect(await fresh(task.id)).toMatchObject({ column: 'ready', runState: 'RUN_ACTIVE', runStateReason: 'going' })
  })

  it('into an ordinary column, nothing about the run changes', async () => {
    const { agent, project, board } = await cast()
    const task = await makeTask(project.id, { boardId: board.id, column: 'ready', assignedAgentId: agent.id, runState: 'RUN_QUEUED' })
    await moveTaskToColumn({ taskId: task.id, column: 'review', boardId: board.id })
    expect((await fresh(task.id)).runState).toBe('RUN_QUEUED')
  })

  it('into an auto-queue column, a run is queued only if none is pending, failed or blocked', async () => {
    const { agent, project, board } = await cast()
    const failed = await makeTask(project.id, { boardId: board.id, column: 'review', assignedAgentId: agent.id, runState: 'RUN_FAILED' })
    await moveTaskToColumn({ taskId: failed.id, column: 'ready', boardId: board.id })
    expect((await fresh(failed.id)).runState).toBe('RUN_FAILED')
  })

  it('into a done column, a queued or throttled run is withdrawn — never one already going', async () => {
    const { agent, project, board } = await cast()
    const queued = await makeTask(project.id, { boardId: board.id, column: 'ready', assignedAgentId: agent.id, runState: 'RUN_THROTTLED', runStartedBy: 'person' })
    const going = await makeTask(project.id, { boardId: board.id, column: 'ready', assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await moveTaskToColumn({ taskId: queued.id, column: 'done', boardId: board.id })
    await moveTaskToColumn({ taskId: going.id, column: 'done', boardId: board.id })
    expect(await fresh(queued.id)).toMatchObject({ runState: 'RUN_NONE', runStartedBy: null })
    expect((await fresh(going.id)).runState).toBe('RUN_ACTIVE')
  })
})

// Spec §3: a column never starts a task early.
describe('a column that queues automatically', () => {
  const AUTO = { status: 'TODO', autoQueue: true }
  const soon = () => new Date(Date.now() + 3_600_000)
  const past = () => new Date(Date.now() - 60_000)

  it('never queues a task with no agent, so it is not queued forever with nothing to run it', async () => {
    const { project } = await cast()
    const task = await makeTask(project.id)
    expect(await applyMoveToRunState(task.id, AUTO, { queuer: null })).toBeNull()
    expect((await fresh(task.id)).runState).toBe('RUN_NONE')
  })

  it.each([
    ['a start time still to come', () => ({ scheduleAt: soon(), scheduleNextDueAt: soon() }), null],
    ["a routine round's time still to come", () => ({ roundAt: soon() }), null],
    ['no time at all', () => ({}), 'queued'],
    ['a start time that has passed', () => ({ scheduleAt: past(), scheduleNextDueAt: null }), 'queued'],
    ['a round whose time has passed', () => ({ roundAt: past() }), 'queued'],
  ] as const)('with %s answers %s', async (_what, patch, expected) => {
    const { agent, project } = await cast()
    const task = await makeTask(project.id, { assignedAgentId: agent.id, ...patch() })
    expect(await applyMoveToRunState(task.id, AUTO, { queuer: null })).toBe(expected)
    expect((await fresh(task.id)).runState).toBe(expected ? 'RUN_QUEUED' : 'RUN_NONE')
  })
})

describe('closing a task (spec §6)', () => {
  it("a move into a done column, by anyone, records task_closed in the dashboard's activity — and not again between done columns", async () => {
    const { agent, project, board } = await cast()
    const task = await makeTask(project.id, { boardId: board.id, column: 'review' })
    await moveTaskToColumn({ taskId: task.id, column: 'done', boardId: board.id, queuer: { kind: 'agent', agentId: agent.id, sessionId: 's1' } })
    await moveTaskToColumn({ taskId: task.id, column: 'shipped', boardId: board.id })
    expect(activityFeed.recordActivity).toHaveBeenCalledTimes(1)
    expect(activityFeed.recordActivity).toHaveBeenCalledWith('task_closed', `PRJ-${task.number} closed`, task.id, project.id)
  })
})

describe("the task's board is told when its run state changes", () => {
  it('a task created queued, and not one created idle', async () => {
    const { dana, agent, project, board } = await cast()
    await createTask({ title: 'Idle', projectId: project.id, boardId: board.id, column: 'review', assignedAgentId: agent.id, origin: originByPerson(dana.id) })
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    await createTask({ title: 'Q', projectId: project.id, boardId: board.id, column: 'review', assignedAgentId: agent.id, queue: true, origin: originByPerson(dana.id) })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it('a column that starts or stops queueing automatically', async () => {
    const { dana, project, board } = await cast()
    await applyAutoQueueChange(board.id, project.id, { newlyEnabled: ['review'], newlyDisabled: [] }, personQueuer(dana.id))
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it('a withdrawn run, and nothing when a move changes no run', async () => {
    const { agent, project, board } = await cast()
    const idle = await makeTask(project.id, { boardId: board.id, column: 'ready', assignedAgentId: agent.id })
    await applyMoveToRunState(idle.id, { status: 'DONE', autoQueue: false }, { queuer: null })
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    const queued = await makeTask(project.id, { boardId: board.id, column: 'ready', assignedAgentId: agent.id, runState: 'RUN_QUEUED' })
    await applyMoveToRunState(queued.id, { status: 'DONE', autoQueue: false }, { queuer: null })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })
})
