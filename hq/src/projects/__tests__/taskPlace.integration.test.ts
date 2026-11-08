/**
 * A task's place in the plan (adr-0174, spec D10, D11, D14, N2), against the real test DB: a new task starts in
 * Backlog on its type's Backlog column, last in the project's order; its column writes its state; a state lands on
 * the type's default column; a type change keeps the state; rank moves go between their neighbours, and two at once
 * into one gap get two ranks; a deprecated board move writes the new place too.
 */
import { describe, it, expect, vi } from 'vitest'
import { compareRanks } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject, joinProjectAs } from '../../test/factories'

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
import { moveTaskToColumn } from '../actions'
import { moveTask, EPIC_IN_EPIC } from '../taskColumnService'
import { ensureBuiltInTaskTypes } from '../taskTypes'
import { createTaskType } from '../taskTypeService'
import { addTypeColumn } from '../typeColumnService'
import { originByPerson } from '../taskOnBehalfOf'

async function project() {
  const person = await createUser()
  const p = await createProject()
  const types = await ensureBuiltInTaskTypes(p.id)
  const columns = await prisma.typeColumn.findMany({ where: { typeId: types.TASK }, orderBy: { order: 'asc' } })
  const col = (state: string) => columns.find(c => c.state === state)!
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { person, project: p, types, col, make }
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const order = async (projectId: string) => (await prisma.task.findMany({ where: { projectId }, select: { id: true, rank: true } }))
  .sort((a, b) => compareRanks(a.rank!, b.rank!)).map(t => t.id)

describe('a new task (D11, N2)', () => {
  it('starts in Backlog on its type\'s Backlog column, last in the order', async () => {
    const { types, col, make, project: p } = await project()
    const a = await make('A')
    const b = await make('B')
    expect(await row(a.id)).toMatchObject({ typeId: types.TASK, columnId: col('BACKLOG').id, state: 'BACKLOG', executionState: 'NOT_STARTED' })
    expect(await order(p.id)).toEqual([a.id, b.id])
  })

  it('a state lands on the type\'s default column for it; a column sets the state', async () => {
    const { col, make } = await project()
    expect(await row((await make('A', { state: 'IN_PROGRESS' })).id)).toMatchObject({ columnId: col('IN_PROGRESS').id, state: 'IN_PROGRESS' })
    expect(await row((await make('B', { columnId: col('DONE').id })).id)).toMatchObject({ state: 'DONE' })
  })

  it('refuses a column of another project', async () => {
    const mine = await project()
    const theirs = await project()
    await expect(mine.make('A', { columnId: theirs.col('TODO').id })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('made of two at once, gets two different ranks', async () => {
    const { make, project: p } = await project()
    await Promise.all([make('A'), make('B'), make('C')].map(t => t.catch(() => null)))
    const ranks = (await prisma.task.findMany({ where: { projectId: p.id }, select: { rank: true } })).map(r => r.rank)
    expect(new Set(ranks).size).toBe(ranks.length)
  })
})

describe('moving a task (D5, D10)', () => {
  it('to a column writes its state with it; to a state lands on the default column', async () => {
    const { col, make } = await project()
    const t = await make('A')
    expect(await moveTask(t.id, { columnId: col('IN_PROGRESS').id })).toMatchObject({ state: 'IN_PROGRESS', columnId: col('IN_PROGRESS').id })
    expect(await moveTask(t.id, { state: 'DONE' })).toMatchObject({ state: 'DONE', columnId: col('DONE').id })
    expect((await row(t.id)).doneAt).not.toBeNull()
  })

  it('to a type keeps its state, on that type\'s default column for it', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const t = await make('A', { state: 'TODO' })
    const moved = await moveTask(t.id, { typeId: bug.id })
    expect(moved).toMatchObject({ typeId: bug.id, state: 'TODO', columnId: bug.columns.find(c => c.state === 'TODO')!.id })
  })

  it('refuses a column of another type', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const t = await make('A')
    await expect(moveTask(t.id, { columnId: bug.columns[0]!.id })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('to Epic: an epic belongs to no epic, and a task made one leaves its agent\'s line', async () => {
    const { types, make } = await project()
    const epic = await make('E', { typeId: types.EPIC })
    const t = await make('A')
    await prisma.task.update({ where: { id: t.id }, data: { epicId: epic.id } })
    await expect(moveTask(t.id, { typeId: types.EPIC })).rejects.toMatchObject({ message: EPIC_IN_EPIC })
    const queued = await make('Q')
    await prisma.task.update({ where: { id: queued.id }, data: { runState: 'RUN_QUEUED', executionState: 'WAITING' } })
    expect(await moveTask(queued.id, { typeId: types.EPIC })).toMatchObject({ typeId: types.EPIC, runState: 'RUN_NONE', executionState: 'NOT_STARTED' })
  })

  it('to Done takes it out of its agent\'s line', async () => {
    const { make } = await project()
    const t = await make('A')
    await prisma.task.update({ where: { id: t.id }, data: { runState: 'RUN_QUEUED', executionState: 'WAITING' } })
    expect(await moveTask(t.id, { state: 'DONE' })).toMatchObject({ runState: 'RUN_NONE', executionState: 'NOT_STARTED' })
  })

  it('two moves at once leave the column and the state agreeing', async () => {
    const { col, make } = await project()
    const t = await make('A')
    await Promise.all([moveTask(t.id, { columnId: col('TODO').id }), moveTask(t.id, { state: 'DONE' })])
    const after = await row(t.id)
    const column = await prisma.typeColumn.findUniqueOrThrow({ where: { id: after.columnId! } })
    expect(after.state).toBe(column.state)
  })

  it('a column added to a state is a place of its own, in that state', async () => {
    const { types, make } = await project()
    const view = await addTypeColumn({ typeId: types.TASK, name: 'Review', state: 'IN_PROGRESS' })
    const review = view.columns.find(c => c.name === 'Review')!
    const t = await make('A')
    expect(await moveTask(t.id, { columnId: review.id })).toMatchObject({ state: 'IN_PROGRESS', columnId: review.id })
  })
})

describe('the project\'s one order (D14)', () => {
  it('a task placed after another goes right after it; before, right before', async () => {
    const { make, project: p } = await project()
    const [a, b, c] = [await make('A'), await make('B'), await make('C')]
    await moveTask(c.id, { afterTaskId: a.id })
    expect(await order(p.id)).toEqual([a.id, c.id, b.id])
    await moveTask(a.id, { beforeTaskId: b.id })
    expect(await order(p.id)).toEqual([c.id, a.id, b.id])
  })

  it('two tasks dropped into the same gap at once get two ranks, both in the gap', async () => {
    const { make, project: p } = await project()
    const [a, b, c, d] = [await make('A'), await make('B'), await make('C'), await make('D')]
    await Promise.all([moveTask(c.id, { afterTaskId: a.id }), moveTask(d.id, { afterTaskId: a.id })])
    const ids = await order(p.id)
    expect(ids[0]).toBe(a.id)
    expect(ids[3]).toBe(b.id)
    expect(new Set(ids.slice(1, 3))).toEqual(new Set([c.id, d.id]))
  })

  it('refuses a neighbour of another project, and itself', async () => {
    const mine = await project()
    const theirs = await project()
    const t = await mine.make('A')
    const other = await theirs.make('B')
    await expect(moveTask(t.id, { afterTaskId: other.id })).rejects.toMatchObject({ statusCode: 400 })
    await expect(moveTask(t.id, { afterTaskId: t.id })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('a deprecated column move writes the new place', () => {
  it('to a column named by its state: that state on its type\'s default column; to the Backlog: Backlog', async () => {
    const { col, make, project: p } = await project()
    const member = await createUserWithRole('MEMBER')
    await joinProjectAs(p.id, member.id)
    const as = { user: member, entities: {} } as never
    const t = await make('A', { state: 'TODO' })
    expect(await row(t.id)).toMatchObject({ state: 'TODO', columnId: col('TODO').id })
    await moveTaskToColumn({ taskId: t.id, column: 'done' }, as)
    expect(await row(t.id)).toMatchObject({ state: 'DONE', columnId: col('DONE').id })
    await moveTaskToColumn({ taskId: t.id, column: null }, as)
    expect(await row(t.id)).toMatchObject({ state: 'BACKLOG', columnId: col('BACKLOG').id })
  })
})
