/**
 * A project's task types and their columns (adr-0174, spec D10), against the real test DB: add, rename, reorder,
 * archive (not with open tasks; never Task or Epic) and delete a never-used type; add, rename, reorder, make default,
 * move to another state (with the tasks it holds) and remove an empty column, every state keeping a column.
 */
import { describe, it, expect, vi } from 'vitest'
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
import { moveTask } from '../taskColumnService'
import { ensureBuiltInTaskTypes } from '../taskTypes'
import { BUILT_IN_TYPE_KEPT, createTaskType, deleteTaskType, listTaskTypes, reorderTaskTypes, setTaskTypeArchived, updateTaskType } from '../taskTypeService'
import { addTypeColumn, moveColumnToState, removeTypeColumn, reorderTypeColumns, setDefaultColumn, tasksInColumn, updateTypeColumn } from '../typeColumnService'
import { originByPerson } from '../taskOnBehalfOf'

async function project() {
  const person = await createUser()
  const p = await createProject()
  const builtIn = await ensureBuiltInTaskTypes(p.id)
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { project: p, builtIn, make }
}

describe('task types', () => {
  it('adds a type with one column per state, last in the list, and refuses a name taken in any case', async () => {
    const { project: p } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug', icon: 'bug' })
    expect(bug).toMatchObject({ name: 'Bug', icon: 'bug', kind: 'CUSTOM' })
    expect(bug.columns.map(c => c.state)).toEqual(['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'])
    expect((await listTaskTypes(p.id)).map(t => t.name)).toEqual(['Task', 'Epic', 'Bug'])
    await expect(createTaskType({ projectId: p.id, name: 'bug' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(createTaskType({ projectId: p.id, name: ' ' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses columns that leave a state without one, or two defaults', async () => {
    const { project: p } = await project()
    await expect(createTaskType({ projectId: p.id, name: 'Odd', columns: [{ name: 'Only', colour: 'neutral', state: 'TODO', defaultForState: true }] }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('renames and reorders', async () => {
    const { project: p, builtIn } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    expect(await updateTaskType({ typeId: bug.id, name: 'Defect' })).toMatchObject({ name: 'Defect' })
    const listed = await reorderTaskTypes(p.id, [bug.id, builtIn.TASK, builtIn.EPIC])
    expect(listed.map(t => t.id)).toEqual([bug.id, builtIn.TASK, builtIn.EPIC])
    await expect(reorderTaskTypes(p.id, [bug.id])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('archives a type only with no open tasks, and never Task or Epic', async () => {
    const { project: p, builtIn, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const t = await make('A', { typeId: bug.id })
    await expect(setTaskTypeArchived(bug.id, true)).rejects.toMatchObject({ statusCode: 409 })
    await moveTask(t.id, { state: 'DONE' })
    expect((await setTaskTypeArchived(bug.id, true)).archivedAt).not.toBeNull()
    expect((await listTaskTypes(p.id)).map(x => x.id)).not.toContain(bug.id)
    await expect(make('B', { typeId: bug.id })).rejects.toMatchObject({ statusCode: 400 })
    expect((await setTaskTypeArchived(bug.id, false)).archivedAt).toBeNull()
    await expect(setTaskTypeArchived(builtIn.TASK, true)).rejects.toMatchObject({ message: BUILT_IN_TYPE_KEPT })
  })

  it('deletes only a type no task has used', async () => {
    const { project: p, builtIn, make } = await project()
    const unused = await createTaskType({ projectId: p.id, name: 'Unused' })
    const used = await createTaskType({ projectId: p.id, name: 'Used' })
    await make('A', { typeId: used.id })
    await deleteTaskType(unused.id)
    expect(await prisma.taskType.findUnique({ where: { id: unused.id } })).toBeNull()
    await expect(deleteTaskType(used.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteTaskType(builtIn.EPIC)).rejects.toMatchObject({ message: BUILT_IN_TYPE_KEPT })
  })
})

describe("a type's columns", () => {
  it('adds a column after its state\'s others, never the default, and keeps the states\' order', async () => {
    const { builtIn } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Review', colour: 'warning', state: 'IN_PROGRESS' })
    expect(view.columns.map(c => c.name)).toEqual(['Backlog', 'To do', 'In progress', 'Review', 'Done'])
    expect(view.columns.find(c => c.name === 'Review')).toMatchObject({ defaultForState: false, colour: 'warning' })
    await expect(addTypeColumn({ typeId: builtIn.TASK, name: 'review', state: 'TODO' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('renames, recolours and reorders within the states\' order', async () => {
    const { builtIn } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Review', state: 'IN_PROGRESS' })
    const id = (n: string) => view.columns.find(c => c.name === n)!.id
    expect((await updateTypeColumn({ columnId: id('Review'), name: 'Checking', colour: 'accent' })).columns.find(c => c.id === id('Review')))
      .toMatchObject({ name: 'Checking', colour: 'accent' })
    const reordered = await reorderTypeColumns(builtIn.TASK, [id('Backlog'), id('To do'), id('Review'), id('In progress'), id('Done')])
    expect(reordered.columns.map(c => c.id)).toEqual([id('Backlog'), id('To do'), id('Review'), id('In progress'), id('Done')])
    await expect(reorderTypeColumns(builtIn.TASK, [id('Done'), id('Backlog'), id('To do'), id('Review'), id('In progress')])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('makes a column its state\'s default, and a task set to that state lands there', async () => {
    const { builtIn, make } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Review', state: 'IN_PROGRESS' })
    const review = view.columns.find(c => c.name === 'Review')!
    const after = await setDefaultColumn(review.id)
    expect(after.columns.filter(c => c.state === 'IN_PROGRESS' && c.defaultForState).map(c => c.id)).toEqual([review.id])
    const t = await make('A', { state: 'IN_PROGRESS' })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).columnId).toBe(review.id)
  })

  it('moves a column to another state with its tasks, and says which tasks changed', async () => {
    const { builtIn, make } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Shipped', state: 'IN_PROGRESS' })
    const shipped = view.columns.find(c => c.name === 'Shipped')!
    const t = await make('A', { columnId: shipped.id })
    expect((await tasksInColumn(shipped.id)).map(x => x.id)).toEqual([t.id])
    const moved = await moveColumnToState(shipped.id, 'DONE')
    expect(moved.tasks.map(x => x.id)).toEqual([t.id])
    expect(moved.type.columns.map(c => c.name)).toEqual(['Backlog', 'To do', 'In progress', 'Done', 'Shipped'])
    expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ state: 'DONE', status: 'DONE', columnId: shipped.id })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).doneAt).not.toBeNull()
  })

  it('refuses moving or removing a state\'s last column, and passes on the default', async () => {
    const { project: p, builtIn } = await project()
    const types = await listTaskTypes(p.id)
    const todo = types[0]!.columns.find(c => c.state === 'TODO')!
    await expect(moveColumnToState(todo.id, 'IN_PROGRESS')).rejects.toMatchObject({ statusCode: 400 })
    await expect(removeTypeColumn(todo.id)).rejects.toMatchObject({ statusCode: 400 })
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Ready', state: 'TODO' })
    const after = await moveColumnToState(todo.id, 'IN_PROGRESS')
    expect(after.type.columns.filter(c => c.state === 'TODO' && c.defaultForState).map(c => c.id)).toEqual([view.columns.find(c => c.name === 'Ready')!.id])
    expect(after.type.columns.filter(c => c.state === 'IN_PROGRESS' && c.defaultForState)).toHaveLength(1)
  })

  it('removes only an empty column', async () => {
    const { builtIn, make } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Review', state: 'IN_PROGRESS' })
    const review = view.columns.find(c => c.name === 'Review')!
    const t = await make('A', { columnId: review.id })
    await expect(removeTypeColumn(review.id)).rejects.toMatchObject({ statusCode: 409 })
    await moveTask(t.id, { state: 'TODO' })
    const after = await removeTypeColumn(review.id)
    expect(after.columns.map(c => c.name)).toEqual(['Backlog', 'To do', 'In progress', 'Done'])
  })

  it('a task moved into a column while the column moves to another state takes the column\'s state', async () => {
    const { builtIn, make } = await project()
    const view = await addTypeColumn({ typeId: builtIn.TASK, name: 'Shipped', state: 'IN_PROGRESS' })
    const shipped = view.columns.find(c => c.name === 'Shipped')!
    const t = await make('A')
    await Promise.all([moveColumnToState(shipped.id, 'DONE'), moveTask(t.id, { columnId: shipped.id })])
    const after = await prisma.task.findUniqueOrThrow({ where: { id: t.id } })
    expect(after).toMatchObject({ columnId: shipped.id, state: 'DONE' })
  })
})
