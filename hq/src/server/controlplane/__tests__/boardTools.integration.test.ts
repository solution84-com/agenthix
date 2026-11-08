/**
 * The agents' task, board and sprint tools on the new model (adr-0174, adr-0176), against the real test DB, through
 * the same services the screens use and under the authority rules every tool keeps: a run reaches its own project
 * only; a person's chat reaches the projects its person is on, and changes nothing as its Viewer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import * as boardOps from '../boardOps'
import * as taskOps from '../taskOps'
import { ensureBuiltInTaskTypes } from '../../../projects/taskTypes'
import { createTaskType } from '../../../projects/taskTypeService'
import { startSprints } from '../../../projects/projectSprintService'
import { createCustomField } from '../../../projects/fieldService'
import { createProject, createTestTask } from '../../../test/factories'
import { seedWorld, chatCtx, runCtx, expectForbidden, setProjectRole, type World } from './controlPlaneFixtures'

let w: World
beforeEach(async () => {
  w = await seedWorld()
  await prisma.projectAgent.create({ data: { projectId: w.project.id, agentId: w.agentId } })
})

const run = () => runCtx(w.project.id)
const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const make = async (title: string, extra: Record<string, unknown> = {}) =>
  (await taskOps.createTaskOp(run(), { title, projectId: w.project.id, ...extra })).taskId

describe('create_task @SC-111', () => {
  it('starts a task in Backlog on its type\'s Backlog column, last in the order, typed Task', async () => {
    const a = await make('First')
    const b = await make('Second')
    const [ra, rb] = [await row(a), await row(b)]
    expect(ra).toMatchObject({ state: 'BACKLOG', runState: 'RUN_NONE' })
    expect(ra.typeId).toBe((await ensureBuiltInTaskTypes(w.project.id)).TASK)
    expect(rb.rank! > ra.rank!).toBe(true)
  })

  it('places it in a named state, into a sprint (moving it to To do) and with a field value', async () => {
    const sprint = await startSprints(w.project.id, { startDate: new Date('2026-11-02'), days: 14 })
    const field = await createCustomField({ projectId: w.project.id, name: 'Stage', options: [{ name: 'Draft' }] })
    const id = await make('Planned', { sprintId: sprint.id, fieldValues: { [field.id]: field.options[0]!.id } })
    expect(await row(id)).toMatchObject({ sprintId: sprint.id, state: 'TODO' })
    expect(await prisma.taskFieldValue.findMany({ where: { taskId: id } })).toEqual([expect.objectContaining({ optionId: field.options[0]!.id })])
  })

  it('creates nothing when its plan, sprint or field breaks a rule', async () => {
    const before = await prisma.task.count()
    await expect(taskOps.createTaskOp(run(), { title: 't', projectId: w.project.id, epicId: w.task.id })).rejects.toMatchObject({ code: 'invalid' })
    await expect(taskOps.createTaskOp(run(), { title: 't', projectId: w.project.id, fieldValues: { 'no-field': 'no-option' } })).rejects.toBeTruthy()
    expect(await prisma.task.count()).toBe(before)
  })
})

describe('update_task', () => {
  it('moves a task by state, onto its type\'s default column for it, and by a column of its type', async () => {
    const id = await make('Move me')
    await taskOps.updateTaskOp(run(), { taskId: id, state: 'IN_PROGRESS' })
    const types = await prisma.typeColumn.findMany({ where: { type: { projectId: w.project.id, kind: 'TASK' } } })
    expect(await row(id)).toMatchObject({ state: 'IN_PROGRESS', columnId: types.find(c => c.state === 'IN_PROGRESS' && c.defaultForState)!.id })
    const done = types.find(c => c.state === 'DONE')!
    const res = await taskOps.updateTaskOp(run(), { taskId: id, columnId: done.id })
    expect(res.task).toMatchObject({ state: 'DONE', columnId: done.id })
  })

  it('refuses a column of another type and changes nothing', async () => {
    const bug = await createTaskType({ projectId: w.project.id, name: 'Bug' })
    const id = await make('Typed Task')
    const before = await row(id)
    await expect(taskOps.updateTaskOp(run(), { taskId: id, columnId: bug.columns[0]!.id })).rejects.toMatchObject({ code: 'invalid' })
    expect((await row(id)).columnId).toBe(before.columnId)
  })

  it('changes the type, keeping the task state', async () => {
    const bug = await createTaskType({ projectId: w.project.id, name: 'Bug' })
    const id = await make('Becomes a bug', { state: 'TODO' })
    await taskOps.updateTaskOp(run(), { taskId: id, typeId: bug.id })
    expect(await row(id)).toMatchObject({ typeId: bug.id, state: 'TODO' })
  })

  it('reorders by the task it goes after, given by its key', async () => {
    const a = await make('A')
    const b = await make('B')
    const key = (await prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })).key
    await taskOps.updateTaskOp(run(), { taskId: a, afterTaskId: `${key}-${(await row(b)).number}` })
    expect((await row(a)).rank! > (await row(b)).rank!).toBe(true)
  })

  it('refuses an agent that is not in the project', async () => {
    await prisma.agent.create({ data: { id: 'agent-out', name: 'Out', handle: 'out' } })
    await expect(taskOps.updateTaskOp(run(), { taskId: w.task.id, assignedAgentId: 'agent-out' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('says what it already changed when a later change is refused', async () => {
    const id = await make('Half')
    const err = await taskOps.updateTaskOp(run(), { taskId: id, state: 'TODO', sprintId: 'no-sprint' }).catch(e => e)
    expect(err.message).toMatch(/Already changed before this: its place/)
    expect((await row(id)).state).toBe('TODO')
  })

  it('refuses a call that names nothing to change', async () => {
    await expect(taskOps.updateTaskOp(run(), { taskId: w.task.id })).rejects.toMatchObject({ code: 'invalid' })
  })

  it("reads back the task's type, column, its type's columns and its plan", async () => {
    await taskOps.updateTaskOp(run(), { taskId: w.task.id, state: 'TODO', planStart: '2026-10-10', planFinish: '2026-10-12' })
    const details = await taskOps.getTaskDetailsOp(run(), { taskId: w.task.id })
    expect(details).toMatchObject({ state: 'TODO', type: 'Task', planStart: '2026-10-10', planFinish: '2026-10-12', epic: null, milestone: null })
    expect(details.typeColumns.map(c => c.state)).toEqual(expect.arrayContaining(['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE']))
  })
})

describe('change_tasks', () => {
  it('moves several tasks to a state and names the ones it could not find', async () => {
    const a = await make('A')
    const b = await make('B')
    const res = await taskOps.changeTasksOp(run(), { taskIds: [a, b, 'NOPE-99'], state: 'TODO' })
    expect(res.changed).toHaveLength(2)
    expect(res.notChanged).toEqual([expect.objectContaining({ task: 'NOPE-99' })])
    expect((await row(a)).state).toBe('TODO')
    expect((await row(b)).state).toBe('TODO')
  })

  it('plans them into a sprint together, or none of them', async () => {
    const sprint = await startSprints(w.project.id, { startDate: new Date('2026-11-02'), days: 14 })
    const epic = await make('Epic', { typeId: (await ensureBuiltInTaskTypes(w.project.id)).EPIC })
    const a = await make('A')
    await expect(taskOps.changeTasksOp(run(), { taskIds: [a, epic], sprintId: sprint.id })).rejects.toMatchObject({ code: 'invalid' })
    expect((await row(a)).sprintId).toBeNull()
    await taskOps.changeTasksOp(run(), { taskIds: [a], sprintId: sprint.id })
    expect(await row(a)).toMatchObject({ sprintId: sprint.id, state: 'TODO' })
  })

  it('refuses tasks of more than one project, and a run outside their project', async () => {
    const other = await createProject({})
    const elsewhere = await createTestTask({ data: { title: 'x', projectId: other.id, number: 1, onBehalfOfUserId: w.member.id } })
    await expect(taskOps.changeTasksOp(run(), { taskIds: [w.task.id, elsewhere.id], state: 'TODO' })).rejects.toMatchObject({ code: 'invalid' })
    await expectForbidden(taskOps.changeTasksOp(runCtx('another-project'), { taskIds: [w.task.id], state: 'TODO' }))
  })
})

describe('list_tasks', () => {
  it("lists the project's tasks in rank order, filtered by state and the current sprint", async () => {
    const a = await make('A')
    const b = await make('B', { state: 'TODO' })
    const listed = await taskOps.listTasksOp(run(), { projectId: w.project.id })
    expect(listed.tasks.map(t => t.taskId).filter(id => id === a || id === b)).toEqual([a, b])
    expect((await taskOps.listTasksOp(run(), { projectId: w.project.id, state: 'TODO' })).tasks.map(t => t.taskId)).toContain(b)
    expect(await taskOps.listTasksOp(run(), { projectId: w.project.id, sprintId: 'current' })).toMatchObject({ tasks: [], note: expect.stringMatching(/no current sprint/) })
  })

  it("stays inside a run's own project", async () => {
    await expectForbidden(taskOps.listTasksOp(runCtx('another-project'), { projectId: w.project.id }))
  })
})

describe('list_boards, get_board and create_board @SC-556', () => {
  it('lists the built-in boards and what tasks are arranged by: types and columns, fields, sprints', async () => {
    await createCustomField({ projectId: w.project.id, name: 'Stage', options: [{ name: 'Draft' }] })
    const listed = await boardOps.listBoardsOp(run(), { projectId: w.project.id })
    expect(listed.boards.map(b => b.kind)).toEqual(expect.arrayContaining(['STATE', 'EXECUTION']))
    expect(listed.types.map(t => t.kind)).toEqual(expect.arrayContaining(['TASK', 'EPIC']))
    expect(listed.fields).toEqual([expect.objectContaining({ name: 'Stage', options: [expect.objectContaining({ name: 'Draft' })] })])
    expect(listed.sprints).toMatchObject({ current: null, upcoming: [] })
  })

  it('reads the task state board, its tasks in their columns', async () => {
    const id = await make('On the board', { state: 'TODO' })
    const board = await boardOps.getBoardOp(run(), { projectId: w.project.id, kind: 'STATE' })
    expect(board.board).toMatchObject({ kind: 'STATE', builtIn: true, moves: 'the task state' })
    expect(board.columns.find(c => c.state === 'TODO')!.tasks.map(t => t.taskId)).toContain(id)
  })

  it('saves a board, reads it by its id, and reads another project\'s board as none', async () => {
    const made = await boardOps.createBoardOp(run(), { projectId: w.project.id, name: 'Now', kind: 'EXECUTION' })
    expect(made).toMatchObject({ success: true, kind: 'EXECUTION' })
    expect((await boardOps.getBoardOp(run(), { projectId: w.project.id, boardId: made.boardId })).board).toMatchObject({ name: 'Now', moves: expect.stringMatching(/nothing/) })
    const other = await createProject({})
    const foreign = await prisma.board.create({ data: { name: 'Theirs', projectId: other.id, view: 'STATE' } })
    await expect(boardOps.getBoardOp(run(), { projectId: w.project.id, boardId: foreign.id })).rejects.toMatchObject({ code: 'not_found' })
  })

  it("stays inside a run's own project, and a Viewer's chat saves nothing", async () => {
    await expectForbidden(boardOps.createBoardOp(runCtx('another-project'), { projectId: w.project.id, name: 'X', kind: 'STATE' }))
    await expectForbidden(boardOps.getBoardOp(runCtx('another-project'), { projectId: w.project.id, kind: 'STATE' }))
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    await expectForbidden(boardOps.createBoardOp(chatCtx(w.member.id), { projectId: w.project.id, name: 'X', kind: 'STATE' }))
  })
})

describe('finish_sprint and rename_sprint', () => {
  it('refuses a project with no sprints', async () => {
    await expect(boardOps.finishSprintOp(run(), { projectId: w.project.id, unfinished: 'next' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/no sprint to finish/) })
  })

  it("needs a destination while a task is not done, and a chat on behalf of the project's Viewer is refused @SC-548 @SC-549", async () => {
    const sprint = await startSprints(w.project.id, { startDate: new Date('2026-11-02'), days: 14 })
    await make('Open', { sprintId: sprint.id })
    await expect(boardOps.finishSprintOp(chatCtx(w.member.id), { projectId: w.project.id })).rejects.toMatchObject({ code: 'invalid' })
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    await expectForbidden(boardOps.finishSprintOp(chatCtx(w.member.id), { projectId: w.project.id, unfinished: 'next' }))
    await setProjectRole(w.project.id, w.member.id, 'MEMBER')
    await expectForbidden(boardOps.finishSprintOp(runCtx('another-project'), { projectId: w.project.id, unfinished: 'next' }))
    const done = await boardOps.finishSprintOp(chatCtx(w.member.id), { projectId: w.project.id, unfinished: 'next' })
    expect(done).toMatchObject({ unfinished: 'next', finished: { number: 1, finished: true }, current: { number: 2 } })
  })

  it('rename_sprint keeps the number @SC-550', async () => {
    const sprint = await startSprints(w.project.id, { startDate: new Date('2026-11-02'), days: 14 })
    expect(await boardOps.renameSprintOp(run(), { sprintId: sprint.id, name: 'Pricing push' }))
      .toMatchObject({ sprint: { number: 1, title: expect.stringContaining('Pricing push') } })
    await expectForbidden(boardOps.renameSprintOp(runCtx('another-project'), { sprintId: sprint.id, name: 'x' }))
  })
})
