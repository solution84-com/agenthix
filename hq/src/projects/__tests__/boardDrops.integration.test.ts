/**
 * Dropping a card on a board (adr-0176, spec B2, B3, D14; data model "How each board kind reads it"), against the
 * real test DB: on a type's column it sets the column and so the state; on the task state board the state, landing
 * on the type's default column; on a field's option that value only; never on the execution board. On a filtered
 * board a card goes after the visible card above it, so the hidden tasks between keep their order.
 */
import { describe, it, expect, vi } from 'vitest'
import { compareRanks } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createTask } from '../taskService'
import { ensureBuiltInTaskTypes } from '../taskTypes'
import { createTaskType } from '../taskTypeService'
import { addTypeColumn } from '../typeColumnService'
import { originByPerson } from '../taskOnBehalfOf'
import { createCustomField } from '../fieldService'
import { dropOnBoard, NEIGHBOUR_MOVED } from '../boardDropService'
import { EXECUTION_NOT_DRAGGED, NO_VALUE_KEY } from '../boardViewRules'
import { saveBoard } from '../boardSaveService'

async function project() {
  const person = await createUser()
  const p = await createProject()
  const builtIn = await ensureBuiltInTaskTypes(p.id)
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { person, project: p, builtIn, make }
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const ordered = async (projectId: string) =>
  (await prisma.task.findMany({ where: { projectId }, select: { title: true, rank: true } }))
    .sort((a, b) => compareRanks(a.rank!, b.rank!)).map(t => t.title)

describe('a drop on a type\'s board', () => {
  it('sets the column, and so the state, and the rank after the card above', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const fixing = (await addTypeColumn({ typeId: bug.id, name: 'Fixing', state: 'IN_PROGRESS' })).columns.find(c => c.name === 'Fixing')!
    const a = await make('A', { typeId: bug.id, columnId: fixing.id })
    const b = await make('B', { typeId: bug.id })
    const card = await dropOnBoard({ projectId: p.id, kind: 'TYPE', typeId: bug.id }, { taskId: b.id, column: fixing.id, beforeTaskId: a.id })
    expect(card.column).toMatchObject({ id: fixing.id, state: 'IN_PROGRESS' })
    expect(await row(b.id)).toMatchObject({ columnId: fixing.id, state: 'IN_PROGRESS' })
    expect(await ordered(p.id)).toEqual(['B', 'A'])
  })

  it('refuses a task of another type and a column the board does not draw', async () => {
    const { project: p, builtIn, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const t = await make('A task')
    const taskTodo = await prisma.typeColumn.findFirstOrThrow({ where: { typeId: builtIn.TASK, state: 'TODO' } })
    const board = { projectId: p.id, kind: 'TYPE' as const, typeId: bug.id }
    await expect(dropOnBoard(board, { taskId: t.id, column: bug.columns[1].id })).rejects.toMatchObject({ statusCode: 400 })
    const b = await make('A bug', { typeId: bug.id })
    await expect(dropOnBoard(board, { taskId: b.id, column: taskTodo.id })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('a drop on the task state board', () => {
  it('sets the state, landing on the type\'s default column for it', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const extra = await addTypeColumn({ typeId: bug.id, name: 'Triaged', state: 'TODO' })
    const defaultTodo = extra.columns.find(c => c.state === 'TODO' && c.defaultForState)!
    const t = await make('A', { typeId: bug.id })
    await dropOnBoard({ projectId: p.id, kind: 'STATE' }, { taskId: t.id, column: 'TODO' })
    expect(await row(t.id)).toMatchObject({ state: 'TODO', columnId: defaultTodo.id })
  })

  it('a reorder within the state keeps the task on the column it was on', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const triaged = (await addTypeColumn({ typeId: bug.id, name: 'Triaged', state: 'TODO' })).columns.find(c => c.name === 'Triaged')!
    const a = await make('A', { typeId: bug.id, state: 'TODO' })
    const b = await make('B', { typeId: bug.id, columnId: triaged.id })
    await dropOnBoard({ projectId: p.id, kind: 'STATE' }, { taskId: b.id, column: 'TODO', beforeTaskId: a.id })
    expect(await row(b.id)).toMatchObject({ columnId: triaged.id })
    expect(await ordered(p.id)).toEqual(['B', 'A'])
  })
})

describe('a drop on a field\'s board', () => {
  it('sets that value only, never the state, and clears it on "No value"', async () => {
    const { project: p, make } = await project()
    const field = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Design' }] })
    const saved = await saveBoard({ projectId: p.id, name: 'Stages', kind: 'FIELD', fieldId: field.id })
    const t = await make('A')
    await dropOnBoard({ boardId: saved.id }, { taskId: t.id, column: field.options[0].id })
    expect(await prisma.taskFieldValue.findMany({ where: { taskId: t.id } })).toMatchObject([{ optionId: field.options[0].id }])
    expect((await row(t.id)).state).toBe('BACKLOG')
    await dropOnBoard({ boardId: saved.id }, { taskId: t.id, column: NO_VALUE_KEY })
    expect(await prisma.taskFieldValue.count({ where: { taskId: t.id } })).toBe(0)
  })
})

describe('the execution board', () => {
  it('is never dragged', async () => {
    const { project: p, make } = await project()
    const t = await make('A')
    await expect(dropOnBoard({ projectId: p.id, kind: 'EXECUTION' }, { taskId: t.id, column: 'RUNNING' })).rejects.toMatchObject({ message: EXECUTION_NOT_DRAGGED })
  })
})

describe('a drop on a filtered board', () => {
  it('goes right after the visible card above it; the hidden tasks keep their order', async () => {
    const { project: p, make } = await project()
    const a = await make('A', { state: 'TODO' })
    await make('Hidden', { state: 'TODO' })
    const c = await make('C', { state: 'TODO' })
    const d = await make('D', { state: 'TODO' })
    const epic = await make('Epic', { typeId: (await ensureBuiltInTaskTypes(p.id)).EPIC })
    for (const t of [a, c, d]) await prisma.task.update({ where: { id: t.id }, data: { epicId: epic.id } })
    const board = { projectId: p.id, kind: 'STATE' as const, filter: { epicId: epic.id } }
    await dropOnBoard(board, { taskId: d.id, column: 'TODO', afterTaskId: a.id })
    expect((await ordered(p.id)).filter(t => t !== 'Epic')).toEqual(['A', 'D', 'Hidden', 'C'])
  })

  it('refuses a drop next to a card the filter hides, or one in another column', async () => {
    const { project: p, make } = await project()
    const a = await make('A', { state: 'TODO' })
    const b = await make('B')
    const t = await make('T', { state: 'TODO' })
    await expect(dropOnBoard({ projectId: p.id, kind: 'STATE' }, { taskId: t.id, column: 'TODO', afterTaskId: b.id }))
      .rejects.toMatchObject({ statusCode: 409, message: NEIGHBOUR_MOVED })
    await expect(dropOnBoard({ projectId: p.id, kind: 'STATE', filter: { agentId: 'nobody' } }, { taskId: t.id, column: 'TODO', afterTaskId: a.id }))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})
