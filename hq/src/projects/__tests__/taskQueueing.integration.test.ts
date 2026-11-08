/**
 * How a task comes to be in its agent's line, against the real test DB (adr-0175, adr-0089, adr-0091, spec §6). No
 * column, creation or move starts work: a task is only ever in line because someone started it. A move never changes
 * a run state except to withdraw a waiting one into a done column, and the task's project's boards are told when that happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../test/factories'
import { ctx, makeTask } from './projectsHarness'

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

import { createTask } from '../taskService'
import { moveTask } from '../taskColumnService'
import { applyMoveToRunState } from '../taskRunMoves'
import { updateTask as updateTaskAction } from '../actions'
import { originByAgentRun, originByPerson } from '../taskOnBehalfOf'
import * as activityFeed from '../../test/fakes/activity'

beforeEach(() => socket.emitTaskUpdated.mockClear())

/** A task type of the project's own: Backlog, Ready (To do), Review (In progress), and two done columns. */
const FLOW = [
  { name: 'Backlog', state: 'BACKLOG', defaultForState: true },
  { name: 'Ready', state: 'TODO', defaultForState: true },
  { name: 'Review', state: 'IN_PROGRESS', defaultForState: true },
  { name: 'Done', state: 'DONE', defaultForState: true },
  { name: 'Shipped', state: 'DONE', defaultForState: false },
] as const
type FlowColumn = (typeof FLOW)[number]['name']

async function cast() {
  const dana = await createUser()
  const agent = await createAgent()
  const project = await createProject({ key: 'PRJ' })
  const type = await prisma.taskType.create({
    data: { projectId: project.id, name: 'Flow', icon: 'task', kind: 'CUSTOM', columns: { create: FLOW.map((c, order) => ({ ...c, colour: 'neutral', order })) } },
    select: { id: true, columns: { select: { id: true, name: true } } },
  })
  const col = Object.fromEntries(type.columns.map(c => [c.name, c.id])) as Record<FlowColumn, string>
  const stateOf = (name: FlowColumn) => FLOW.find(c => c.name === name)!.state
  /** A task of the type, in the column named. */
  const inColumn = (name: FlowColumn, data: Record<string, unknown> = {}) =>
    makeTask(project.id, { typeId: type.id, columnId: col[name], state: stateOf(name), ...data })
  return { dana, agent, project, typeId: type.id, col, inColumn }
}
const fresh = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const queuedBy = (t: { queuedByUserId: string | null; queuedByAgentId: string | null; queuedBySessionId: string | null }) =>
  ({ user: t.queuedByUserId, agent: t.queuedByAgentId, session: t.queuedBySessionId })

describe('createTask records who it is for, and never starts work (adr-0175)', () => {
  it('created idle: records who it is for, and no queuer — nobody has queued it', async () => {
    const { dana, agent, project } = await cast()
    const task = await createTask({ title: 'T', projectId: project.id, assignedAgentId: agent.id, origin: originByPerson(dana.id) })
    const row = await fresh(task.id)
    expect(row).toMatchObject({ onBehalfOfUserId: dana.id, runState: 'RUN_NONE' })
    expect(queuedBy(row)).toEqual({ user: null, agent: null, session: null })
  })

  it('landing in To do leaves it with no run pending', async () => {
    const { dana, agent, project, typeId, col } = await cast()
    const ready = await createTask({ title: 'T', projectId: project.id, typeId, columnId: col.Ready, assignedAgentId: agent.id, origin: originByAgentRun(dana.id, agent.id, 's1') })
    expect(await fresh(ready.id)).toMatchObject({ columnId: col.Ready, state: 'TODO', runState: 'RUN_NONE', executionState: 'NOT_STARTED' })
    expect(queuedBy(await fresh(ready.id))).toEqual({ user: null, agent: null, session: null })
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

  it('a move into To do starts nothing — moving a finished task back included', async () => {
    const { dana, agent, col, inColumn } = await cast()
    const task = await inColumn('Done', { assignedAgentId: agent.id })
    await moveTask(task.id, { columnId: col.Ready }, { kind: 'person', userId: dana.id })
    expect(await fresh(task.id)).toMatchObject({ columnId: col.Ready, runState: 'RUN_NONE' })
  })
})

describe('a move never changes the run state, except to withdraw (spec §6)', () => {
  it('a running task stays running when moved', async () => {
    const { agent, col, inColumn } = await cast()
    const task = await inColumn('Review', { assignedAgentId: agent.id, runState: 'RUN_ACTIVE', runStateReason: 'going' })
    await moveTask(task.id, { columnId: col.Ready })
    expect(await fresh(task.id)).toMatchObject({ columnId: col.Ready, runState: 'RUN_ACTIVE', runStateReason: 'going' })
  })

  it('into an ordinary column, nothing about the run changes', async () => {
    const { agent, col, inColumn } = await cast()
    const task = await inColumn('Ready', { assignedAgentId: agent.id, runState: 'RUN_QUEUED' })
    await moveTask(task.id, { columnId: col.Review })
    expect((await fresh(task.id)).runState).toBe('RUN_QUEUED')
  })

  it('into a done column, a waiting run is withdrawn — never one already going', async () => {
    const { agent, col, inColumn } = await cast()
    const queued = await inColumn('Ready', { assignedAgentId: agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person' })
    const going = await inColumn('Ready', { assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await moveTask(queued.id, { columnId: col.Done })
    await moveTask(going.id, { columnId: col.Done })
    expect(await fresh(queued.id)).toMatchObject({ runState: 'RUN_NONE', runStartedBy: null })
    expect((await fresh(going.id)).runState).toBe('RUN_ACTIVE')
  })

  it('into Backlog, a waiting run is withdrawn — never one already going — and a move within To do keeps it', async () => {
    const { agent, col, inColumn } = await cast()
    const queued = await inColumn('Ready', { assignedAgentId: agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person' })
    const going = await inColumn('Review', { assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await moveTask(queued.id, { columnId: col.Backlog })
    await moveTask(going.id, { state: 'BACKLOG' })
    expect(await fresh(queued.id)).toMatchObject({ state: 'BACKLOG', runState: 'RUN_NONE', runStartedBy: null })
    expect((await fresh(going.id)).runState).toBe('RUN_ACTIVE')
  })
})

describe('closing a task (spec §6)', () => {
  it("a move into a done column, by anyone, records task_closed in the dashboard's activity — and not again between done columns", async () => {
    const { agent, project, col, inColumn } = await cast()
    const task = await inColumn('Review')
    await moveTask(task.id, { columnId: col.Done }, { kind: 'agent', agentId: agent.id })
    await moveTask(task.id, { columnId: col.Shipped })
    expect(activityFeed.recordActivity).toHaveBeenCalledTimes(1)
    expect(activityFeed.recordActivity).toHaveBeenCalledWith('task_closed', `PRJ-${task.number} closed`, task.id, project.id)
  })
})

describe("the task's project's boards are told when its run state changes", () => {
  it('a withdrawn run, and nothing when a move changes no run', async () => {
    const { agent, project, inColumn } = await cast()
    const idle = await inColumn('Ready', { assignedAgentId: agent.id })
    await applyMoveToRunState(idle.id, { status: 'DONE' })
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    const queued = await inColumn('Ready', { assignedAgentId: agent.id, runState: 'RUN_QUEUED' })
    await applyMoveToRunState(queued.id, { status: 'DONE' })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(project.id)
  })
})
