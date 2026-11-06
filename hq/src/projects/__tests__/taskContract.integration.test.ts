/**
 * The task rules every task screen builds on (T0, T2, T9, T10), against the real test DB: an epic is never run and
 * has no agent; an archived task can be brought back by whoever may archive it; comments thread one level deep;
 * and what happens to a task is in its activity, with who did it.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole, createProject, joinProjectAs } from '../../test/factories'
import { ctx, makeBoard, makeTask, assignAgent } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { addTaskComment, archiveTask, createTask, moveTaskToColumn, runTask, unarchiveTask, updateTask } from '../actions'
import { updateTaskPlan } from '../planOperations'
import { getTaskActivity } from '../taskActivityQueries'
import { claimTask } from '../../agents/taskSlotClaim'
import { queueRunIfNone } from '../taskRunMoves'
import { personQueuer } from '../taskOnBehalfOf'
import { EPIC_HAS_NO_AGENT, EPIC_NOT_RUN } from '../epicRules'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', order: 0, color: 'x' },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', order: 1, color: 'x', autoQueue: true },
  { name: 'done', label: 'Done', status: 'DONE', order: 2, color: 'x' },
]

async function cast(taskData: Record<string, unknown> = {}) {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await joinProjectAs(project.id, person.id, 'MEMBER')
  const agent = await createAgent()
  await assignAgent(project.id, agent.id)
  const board = await makeBoard(project.id, { columns: COLUMNS })
  const task = await makeTask(project.id, { boardId: board.id, column: 'todo', onBehalfOfUserId: person.id, ...taskData })
  return { person, project, agent, board, task }
}

const activityOf = (taskId: string) => prisma.taskActivity.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } })

describe('an epic is never run (T10)', () => {
  it('refuses Run on an epic, and starts nothing', async () => {
    const c = await cast({ isEpic: true })
    await expect(runTask({ taskId: c.task.id }, ctx(c.person))).rejects.toMatchObject({ statusCode: 400, message: EPIC_NOT_RUN })
    expect(taskRunnerFake.startedTasks).toEqual([])
    expect((await prisma.task.findUniqueOrThrow({ where: { id: c.task.id } })).runState).toBe('RUN_NONE')
  })

  it('is never claimed, even when something left it queued', async () => {
    const c = await cast({ isEpic: true, assignedAgentId: null, runState: 'RUN_QUEUED' })
    await prisma.task.update({ where: { id: c.task.id }, data: { assignedAgentId: c.agent.id } })
    expect(await claimTask(c.task.id, c.agent.id, c.project.id, 'person', c.person.id)).toBe('skipped')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: c.task.id } })).runState).toBe('RUN_QUEUED')
  })

  it('is never queued by a move into a column that queues', async () => {
    const c = await cast({ isEpic: true })
    await prisma.task.update({ where: { id: c.task.id }, data: { assignedAgentId: c.agent.id } })
    expect(await queueRunIfNone(c.task.id, personQueuer(c.person.id))).toBe(false)
  })

  it('refuses an agent for an epic, and a task with an agent becoming one', async () => {
    const epic = await cast({ isEpic: true })
    await expect(updateTask({ taskId: epic.task.id, assignedAgentId: epic.agent.id }, ctx(epic.person))).rejects.toMatchObject({ statusCode: 400, message: EPIC_HAS_NO_AGENT })
    const assigned = await cast({ assignedAgentId: undefined })
    await prisma.task.update({ where: { id: assigned.task.id }, data: { assignedAgentId: assigned.agent.id } })
    await expect(updateTaskPlan({ taskId: assigned.task.id, isEpic: true }, ctx(assigned.person))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: assigned.task.id } })).isEpic).toBe(false)
  })
})

describe('unarchiving a task (T9)', () => {
  it('brings an archived task back, and records both', async () => {
    const c = await cast()
    await archiveTask({ taskId: c.task.id }, ctx(c.person))
    const back = await unarchiveTask({ taskId: c.task.id }, ctx(c.person))
    expect(back.archived).toBe(false)
    expect((await activityOf(c.task.id)).map(a => [a.kind, a.userId])).toEqual([['ARCHIVED', c.person.id], ['UNARCHIVED', c.person.id]])
  })

  it('is refused to someone not in the project, and changes nothing', async () => {
    const c = await cast({ archived: true })
    const outsider = await createUserWithRole('MEMBER')
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.task.update({ where: { id: c.task.id }, data: { projectId: project.id } })
    await expect(unarchiveTask({ taskId: c.task.id }, ctx(outsider))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: c.task.id } })).archived).toBe(true)
  })
})

describe('comments thread one level deep (T0)', () => {
  it('takes a reply to a top-level comment, and refuses a reply to a reply or to another task', async () => {
    const c = await cast()
    const other = await cast()
    const top = await addTaskComment({ taskId: c.task.id, content: 'Should this cover the footer too?' }, ctx(c.person))
    const reply = await addTaskComment({ taskId: c.task.id, content: 'Yes', parentId: top.id }, ctx(c.person))
    expect(reply.parentId).toBe(top.id)
    await expect(addTaskComment({ taskId: c.task.id, content: 'And?', parentId: reply.id }, ctx(c.person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(addTaskComment({ taskId: other.task.id, content: 'Here?', parentId: top.id }, ctx(other.person))).rejects.toMatchObject({ statusCode: 404 })
    expect(await prisma.taskComment.count()).toBe(2)
  })
})

describe('a comment saved from the conversation (T0)', () => {
  it('is stored as saved and read back as such; a comment written in the comments is not', async () => {
    const c = await cast()
    const saved = await addTaskComment({ taskId: c.task.id, content: 'Keep the tone', savedFromConversation: true }, ctx(c.person))
    const written = await addTaskComment({ taskId: c.task.id, content: 'Typed here' }, ctx(c.person))
    expect(saved.savedFromConversation).toBe(true)
    expect(written.savedFromConversation).toBe(false)
    const rows = await prisma.taskComment.findMany({ where: { taskId: c.task.id }, orderBy: { createdAt: 'asc' } })
    expect(rows.map(r => r.savedFromConversation)).toEqual([true, false])
  })
})

describe("a task's activity (T0)", () => {
  it('records its creation, an edit with the fields it changed, an assignment, a move and a comment, by whom', async () => {
    const c = await cast()
    const created = await createTask({ projectId: c.project.id, title: 'Check the footer links', boardId: c.board.id }, ctx(c.person))
    await updateTask({ taskId: created.id, title: 'Check every footer link', description: 'All pages' }, ctx(c.person))
    await updateTask({ taskId: created.id, assignedAgentId: c.agent.id }, ctx(c.person))
    await moveTaskToColumn({ taskId: created.id, column: 'done' }, ctx(c.person))
    await addTaskComment({ taskId: created.id, content: 'Looks good' }, ctx(c.person))

    const rows = await activityOf(created.id)
    expect(rows.map(r => r.kind)).toEqual(['CREATED', 'EDITED', 'ASSIGNED', 'MOVED', 'COMMENTED'])
    expect(rows.every(r => r.userId === c.person.id && r.agentId === null)).toBe(true)
    expect(rows[1].detail).toEqual({ fields: ['title', 'description'] })
    expect(rows[2].detail).toEqual({ fromAgentId: null, toAgentId: c.agent.id })
    expect(rows[3].detail).toMatchObject({ to: { boardId: c.board.id, column: 'done' } })
  })

  it('records nothing for an edit that changed nothing', async () => {
    const c = await cast()
    await updateTask({ taskId: c.task.id, title: c.task.title }, ctx(c.person))
    expect(await activityOf(c.task.id)).toEqual([])
  })

  it('is read newest first, with who did it by name, by whoever may see the task', async () => {
    const c = await cast()
    await archiveTask({ taskId: c.task.id }, ctx(c.person))
    await prisma.taskActivity.create({ data: { taskId: c.task.id, kind: 'RUN_FINISHED', agentId: c.agent.id, runId: 'run-x', detail: { number: 1 } } })
    const rows = await getTaskActivity({ taskId: c.task.id }, ctx(c.person))
    expect(rows.map(r => [r.kind, r.by, r.name])).toEqual([['RUN_FINISHED', 'agent', c.agent.name], ['ARCHIVED', 'person', 'You']])
  })
})
