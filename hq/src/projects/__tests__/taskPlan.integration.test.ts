/**
 * A task's plan, epics and milestones (adr-0098), against the real test DB.
 * The rule that binds: nothing that changes a plan, an epic or a milestone
 * starts, stops or queues a run — through hq's action or an agent's tool.
 * Written by lane W of the every-screen-reviewed unit; run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { setTaskPlan } from '../taskPlanService'
import { updateTaskPlan, createMilestone, updateMilestone, deleteMilestone, getMilestones } from '../planOperations'
import { updateTaskOp } from '../../server/controlplane/taskWriteOps'
import { listMilestonesOp, createMilestoneOp, deleteMilestoneOp } from '../../server/controlplane/planOps'
import { chatCtx, chatSession, expectForbidden, runCtx, setProjectRole } from '../../server/controlplane/__tests__/controlPlaneFixtures'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { ctx } from './projectsHarness'

const AUTO = [
  { name: 'ready', label: 'Ready', status: 'TODO', order: 0, color: 'x', autoQueue: true },
  { name: 'done', label: 'Done', status: 'DONE', order: 1, color: 'x' },
]
let number = 0

async function world() {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const agent = await createAgent()
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  await chatSession(person.id, agent.id)
  const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: AUTO } })
  const task = (data: Record<string, unknown> = {}) => prisma.task.create({
    data: { title: `T${++number}`, projectId: project.id, number, boardId: board.id, column: 'ready', assignedAgentId: agent.id, onBehalfOfUserId: person.id, ...data } as never,
  })
  return { person, project, agent, board, task }
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const runFields = (t: Awaited<ReturnType<typeof row>>) => [t.runState, t.runStartedBy, t.scheduleAt, t.scheduleNextDueAt, t.column]

describe('nothing that changes a plan, an epic or a milestone starts, stops or queues a run @SC-552', () => {
  it.each([
    ['idle, in a column that starts work', { runState: 'RUN_NONE' }],
    ['queued', { runState: 'RUN_QUEUED' }],
    ['running', { runState: 'RUN_ACTIVE' }],
    ['with a start time to come', { runState: 'RUN_NONE', scheduleAt: new Date(Date.now() + 3_600_000), scheduleNextDueAt: new Date(Date.now() + 3_600_000) }],
  ])('a task %s keeps its run state, its start time and its column', async (_what, data) => {
    const { person, project, task } = await world()
    const t = await task(data)
    const epic = await task({ isEpic: true, column: null })
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Live', date: new Date('2026-11-30') } })
    const before = runFields(await row(t.id))

    await updateTaskPlan({ taskId: t.id, planStart: '2026-10-10', planFinish: '2026-10-20', epicId: epic.id }, ctx(person))
    await updateTaskOp(chatCtx(person.id), { taskId: t.id, planStart: null, epicId: null })
    await setTaskPlan(epic.id, { milestoneId: milestone.id, planStart: '2026-10-01' })
    await updateMilestone({ milestoneId: milestone.id, date: '2026-12-01' }, ctx(person))
    await deleteMilestone({ milestoneId: milestone.id }, ctx(person))

    expect(runFields(await row(t.id))).toEqual(before)
    expect(taskRunnerFake.startedTasks).toEqual([])
  })
})

describe("a task's plan @SC-552", () => {
  it('is set and cleared by day, and refuses a finish before its start', async () => {
    const { person, task } = await world()
    const t = await task()
    await updateTaskPlan({ taskId: t.id, planStart: '2026-10-10', planFinish: '2026-10-12' }, ctx(person))
    expect(await row(t.id)).toMatchObject({ planStart: new Date('2026-10-10T00:00:00Z'), planFinish: new Date('2026-10-12T00:00:00Z') })
    await expect(updateTaskPlan({ taskId: t.id, planFinish: '2026-10-01' }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await updateTaskPlan({ taskId: t.id, planStart: null }, ctx(person))
    expect(await row(t.id)).toMatchObject({ planStart: null, planFinish: new Date('2026-10-12T00:00:00Z') })
  })

  it('is changed only by a member of the project', async () => {
    const { task } = await world()
    const t = await task()
    const outsider = await createUserWithRole('ADMIN')
    const project = await prisma.project.findUniqueOrThrow({ where: { id: t.projectId } })
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    await expect(updateTaskPlan({ taskId: t.id, planStart: '2026-10-10' }, ctx(outsider))).rejects.toMatchObject({ statusCode: 403 })
    expect((await row(t.id)).planStart).toBeNull()
  })
})

describe('epics and milestones @SC-553', () => {
  it('a task belongs to at most one epic, an epic to none, and only an epic has a milestone', async () => {
    const { person, project, task } = await world()
    const epic = await task({ isEpic: true })
    const other = await task({ isEpic: true })
    const t = await task()
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Live', date: new Date('2026-11-30') } })

    await updateTaskPlan({ taskId: t.id, epicId: epic.id }, ctx(person))
    await updateTaskPlan({ taskId: t.id, epicId: other.id }, ctx(person))
    expect((await row(t.id)).epicId).toBe(other.id)
    await expect(updateTaskPlan({ taskId: epic.id, epicId: other.id }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateTaskPlan({ taskId: t.id, milestoneId: milestone.id }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateTaskPlan({ taskId: t.id, isEpic: true }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateTaskPlan({ taskId: other.id, isEpic: false }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await updateTaskPlan({ taskId: epic.id, milestoneId: milestone.id }, ctx(person))
    expect((await row(epic.id)).milestoneId).toBe(milestone.id)
  })

  it("refuses another project's epic or milestone", async () => {
    const a = await world()
    const b = await world()
    const t = await a.task()
    const foreignEpic = await b.task({ isEpic: true })
    const epic = await a.task({ isEpic: true })
    const foreignMilestone = await prisma.milestone.create({ data: { projectId: b.project.id, name: 'Theirs', date: new Date('2026-11-30') } })
    await expect(updateTaskPlan({ taskId: t.id, epicId: foreignEpic.id }, ctx(a.person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateTaskPlan({ taskId: epic.id, milestoneId: foreignMilestone.id }, ctx(a.person))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deleting a milestone keeps its epics; deleting an epic keeps its tasks, in no epic', async () => {
    const { person, project, task } = await world()
    const epic = await task({ isEpic: true })
    const t = await task({ epicId: epic.id })
    const m = await createMilestone({ projectId: project.id, name: 'Live', date: '2026-11-30' }, ctx(person))
    await setTaskPlan(epic.id, { milestoneId: m.id })
    expect((await getMilestones({ projectId: project.id }, ctx(person)))[0].epics.map(e => e.id)).toEqual([epic.id])
    await deleteMilestone({ milestoneId: m.id }, ctx(person))
    expect((await row(epic.id)).milestoneId).toBeNull()
    await prisma.task.delete({ where: { id: epic.id } })
    expect((await row(t.id)).epicId).toBeNull()
  })
})

describe("agents' tools read and set plans, epics and milestones under the rules of their other task changes @SC-556", () => {
  it('update_task sets a plan and an epic; a run outside the project is refused', async () => {
    const { person, task } = await world()
    const epic = await task({ isEpic: true })
    const t = await task()
    await updateTaskOp(chatCtx(person.id), { taskId: t.id, planStart: '2026-10-10', planFinish: '2026-10-11', epicId: epic.id })
    expect(await row(t.id)).toMatchObject({ epicId: epic.id, planStart: new Date('2026-10-10T00:00:00Z') })
    await expectForbidden(updateTaskOp(runCtx('another-project'), { taskId: t.id, planStart: '2026-10-12' }))
    expect((await row(t.id)).planStart).toEqual(new Date('2026-10-10T00:00:00Z'))
  })

  it('milestones are listed and made in the run\'s own project; deleting one needs someone who works there, as in the browser', async () => {
    const { person, project, task } = await world()
    // A run of one of the project's tasks, on behalf of its person (adr-0101).
    const own = runCtx(project.id, { taskId: (await task()).id })
    const made = await createMilestoneOp(own, { projectId: project.id, name: 'Beta', date: '2026-11-01' })
    expect((await listMilestonesOp(own, { projectId: project.id })).milestones.map(m => m.name)).toEqual(['Beta'])
    await expectForbidden(createMilestoneOp(runCtx('elsewhere'), { projectId: project.id, name: 'X', date: '2026-11-01' }))
    // Deleting one changes the project, as in the browser: its Viewer may not (adr-0101, adr-0102).
    await setProjectRole(project.id, person.id, 'VIEWER')
    await expectForbidden(deleteMilestoneOp(chatCtx(person.id), { milestoneId: made.milestoneId }))
    await setProjectRole(project.id, person.id, 'MEMBER')
    await deleteMilestoneOp(chatCtx(person.id), { milestoneId: made.milestoneId })
    expect(await prisma.milestone.count({ where: { projectId: project.id } })).toBe(0)
  })
})
