/**
 * Boards as saved views (adr-0176, spec D3, B1, B5, BS1, N5), against the real test DB: a board reads one type's
 * columns, the task states, the execution states or a field's options, with its cards in rank order and counts; a
 * filter only hides cards; saved boards are the project's, renamed, copied and deleted as views only; the list puts
 * the two built-in boards first with each board's spread.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUser, createProject } from '../../test/factories'

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
import { createTaskType } from '../taskTypeService'
import { originByPerson } from '../taskOnBehalfOf'
import { createCustomField, setTaskFieldValue } from '../fieldService'
import { readBoard } from '../boardViewService'
import { listBoards } from '../boardListService'
import { deleteSavedBoard, duplicateSavedBoard, saveBoard, updateSavedBoard } from '../boardSaveService'
import { planIntoSprint, startSprints } from '../projectSprintService'
import { NO_VALUE_KEY } from '../boardViewRules'

async function project() {
  const person = await createUser()
  const p = await createProject()
  const builtIn = await ensureBuiltInTaskTypes(p.id)
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { person, project: p, builtIn, make }
}

const titles = (cards: Array<{ title: string }>) => cards.map(c => c.title)

describe('reading a board', () => {
  it('a type\'s board shows that type\'s columns and only its tasks, in rank order, with counts', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug', icon: 'bug' })
    const a = await make('A', { typeId: bug.id })
    const b = await make('B', { typeId: bug.id })
    await make('Not a bug')
    await moveTask(b.id, { beforeTaskId: a.id })
    const read = await readBoard({ projectId: p.id, kind: 'TYPE', typeId: bug.id })
    expect(read.columns.map(c => c.name)).toEqual(bug.columns.map(c => c.name))
    expect(titles(read.columns[0].cards)).toEqual(['B', 'A'])
    expect(read.columns[0].count).toBe(2)
    expect(read).toMatchObject({ totalCount: 2, shownCount: 2, mixesTypes: false, board: { id: null, builtIn: false, name: "Bug's columns" } })
    expect(read.columns[0].cards[0]).toMatchObject({ key: `${p.key}-${b.number}`, type: { name: 'Bug' }, column: { name: bug.columns[0].name } })
  })

  it('the task state board shows every type by state, and says it mixes types', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    await make('Bug one', { typeId: bug.id, state: 'TODO' })
    await make('Task one', { state: 'TODO' })
    await make('Idea')
    const read = await readBoard({ projectId: p.id, kind: 'STATE' })
    expect(read.columns.map(c => [c.key, c.count])).toEqual([['BACKLOG', 1], ['TODO', 2], ['IN_PROGRESS', 0], ['DONE', 0]])
    expect(read.mixesTypes).toBe(true)
    expect(read.board).toMatchObject({ name: 'Task state', builtIn: true, readOnly: false })
  })

  it('the execution board shows the execution states, read-only, and no epic', async () => {
    const { project: p, builtIn, make } = await project()
    const t = await make('Running one')
    await prisma.task.update({ where: { id: t.id }, data: { executionState: 'RUNNING' } })
    await make('An epic', { typeId: builtIn.EPIC })
    const read = await readBoard({ projectId: p.id, kind: 'EXECUTION' })
    expect(read.board.readOnly).toBe(true)
    expect(titles(read.columns.find(c => c.key === 'RUNNING')!.cards)).toEqual(['Running one'])
    expect(read.totalCount).toBe(1)
  })

  it('a field\'s board shows "No value" first, then its options', async () => {
    const { project: p, make } = await project()
    const field = await createCustomField({ projectId: p.id, name: 'Launch stage', options: [{ name: 'Design' }, { name: 'Live' }] })
    const a = await make('A')
    await make('B')
    await setTaskFieldValue(a.id, field.id, field.options[1].id)
    const read = await readBoard({ projectId: p.id, kind: 'FIELD', fieldId: field.id })
    expect(read.columns.map(c => [c.name, c.count])).toEqual([['No value', 1], ['Design', 0], ['Live', 1]])
    expect(read.columns[0].key).toBe(NO_VALUE_KEY)
  })

  it('a filter to the current sprint, an epic or an agent only hides cards', async () => {
    const { project: p, builtIn, make } = await project()
    const agent = await createAgent()
    const epic = await make('Launch', { typeId: builtIn.EPIC })
    const a = await make('In sprint, in epic, agent')
    const b = await make('In sprint only')
    await make('Elsewhere')
    await prisma.task.update({ where: { id: a.id }, data: { epicId: epic.id, assignedAgentId: agent.id } })
    const sprint = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await planIntoSprint(sprint.id, [a.id, b.id])
    const sprintOnly = await readBoard({ projectId: p.id, kind: 'STATE', filter: { sprint: { current: true } } })
    expect(sprintOnly).toMatchObject({ totalCount: 4, shownCount: 2, currentSprintId: sprint.id })
    const all = await readBoard({ projectId: p.id, kind: 'STATE', filter: { sprint: { current: true }, epicId: epic.id, agentId: agent.id } })
    expect(all.shownCount).toBe(1)
    expect(all.columns.find(c => c.key === 'TODO')!.cards[0]).toMatchObject({ title: 'In sprint, in epic, agent', agent: { id: agent.id } })
  })

  it('refuses a type or field of another project, and a type board with no type', async () => {
    const { project: p } = await project()
    const other = await createProject()
    const theirs = await createTaskType({ projectId: other.id, name: 'Theirs' })
    await expect(readBoard({ projectId: p.id, kind: 'TYPE', typeId: theirs.id })).rejects.toMatchObject({ statusCode: 400 })
    await expect(readBoard({ projectId: p.id, kind: 'TYPE' })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('saved boards', () => {
  it('saves a view with a name and filter, reads it back by id, and keeps what it shows', async () => {
    const { project: p } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const saved = await saveBoard({ projectId: p.id, name: 'Sprint bugs', kind: 'TYPE', typeId: bug.id, filter: { sprint: { current: true }, junk: 1 } })
    expect(saved).toMatchObject({ name: 'Sprint bugs', kind: 'TYPE', typeId: bug.id, filter: { sprint: { current: true } } })
    const read = await readBoard({ boardId: saved.id })
    expect(read.board).toMatchObject({ id: saved.id, name: 'Sprint bugs', builtIn: false })
    await expect(saveBoard({ projectId: p.id, name: 'sprint BUGS', kind: 'STATE' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('renames, changes its filter, copies and deletes only the view', async () => {
    const { project: p, make } = await project()
    const t = await make('Stays')
    const saved = await saveBoard({ projectId: p.id, name: 'Mine', kind: 'STATE' })
    expect(await updateSavedBoard(saved.id, { name: 'Ours', filter: { epicId: 'e' } })).toMatchObject({ name: 'Ours', filter: { epicId: 'e' } })
    expect((await duplicateSavedBoard(saved.id)).name).toBe('Ours (copy)')
    expect((await duplicateSavedBoard(saved.id)).name).toBe('Ours (copy 2)')
    await deleteSavedBoard(saved.id)
    expect(await prisma.board.findUnique({ where: { id: saved.id } })).toBeNull()
    expect(await prisma.task.findUnique({ where: { id: t.id } })).not.toBeNull()
    await expect(readBoard({ boardId: saved.id })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a board that owned its tasks is not read as a view', async () => {
    const { project: p } = await project()
    const old = await prisma.board.create({ data: { projectId: p.id, name: 'Old' } })
    await expect(readBoard({ boardId: old.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteSavedBoard(old.id)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the Boards list', () => {
  it('puts the two built-in boards first, then the saved ones, each with its spread and needs-you count', async () => {
    const { project: p, make } = await project()
    const field = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Copy' }] })
    const a = await make('A', { state: 'TODO' })
    await make('B')
    await prisma.task.update({ where: { id: a.id }, data: { executionState: 'NEEDS_YOU' } })
    await setTaskFieldValue(a.id, field.id, field.options[0].id)
    await saveBoard({ projectId: p.id, name: 'Stage board', kind: 'FIELD', fieldId: field.id })
    const list = await listBoards(p.id)
    expect(list.map(b => b.key).slice(0, 2)).toEqual(['state', 'execution'])
    expect(list[0]).toMatchObject({ builtIn: true, needsYouCount: 1 })
    expect(list[0].spread.map(s => s.count)).toEqual([1, 1, 0, 0])
    expect(list[2]).toMatchObject({ name: 'Stage board', fieldName: 'Stage', builtIn: false })
    expect(list[2].spread.map(s => [s.name, s.count])).toEqual([['No value', 1], ['Copy', 1]])
    expect(list[2].lastMovedAt).not.toBeNull()
    expect(list[1].lastMovedAt).toBeNull()
  })
})
