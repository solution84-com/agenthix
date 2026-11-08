/**
 * A project's custom fields (spec D4), against the real test DB: single select with options in order; names unique
 * in any case; archive keeps the values; deleting a field takes its values and boards, never a task; a task's value
 * is one option of the field or none, and never touches its state.
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
import { originByPerson } from '../taskOnBehalfOf'
import {
  addFieldOption, createCustomField, customFieldUse, deleteCustomField, FIELD_NOT_IN_PROJECT, listCustomFields, OPTION_NOT_OF_FIELD,
  removeFieldOption, renameCustomField, reorderCustomFields, reorderFieldOptions, setCustomFieldArchived, setTaskFieldValue,
  taskFieldValues, updateFieldOption,
} from '../fieldService'
import { saveBoard } from '../boardSaveService'

async function project() {
  const person = await createUser()
  const p = await createProject()
  const make = (title: string) => createTask({ title, projectId: p.id, origin: originByPerson(person.id) })
  return { person, project: p, make }
}

describe('fields', () => {
  it('makes a single-select field with its options in order, last in the list, its name unique in any case', async () => {
    const { project: p } = await project()
    await createCustomField({ projectId: p.id, name: 'Audience' })
    const stage = await createCustomField({ projectId: p.id, name: 'Launch stage', options: [{ name: 'Copy', colour: 'accent' }, { name: 'Live' }] })
    expect(stage).toMatchObject({ type: 'SINGLE_SELECT', options: [{ name: 'Copy', colour: 'accent', order: 0 }, { name: 'Live', colour: 'neutral', order: 1 }] })
    expect((await listCustomFields(p.id)).map(f => f.name)).toEqual(['Audience', 'Launch stage'])
    await expect(createCustomField({ projectId: p.id, name: 'audience' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(createCustomField({ projectId: p.id, name: 'X', options: [{ name: 'A' }, { name: 'a' }] })).rejects.toMatchObject({ statusCode: 400 })
    await expect(createCustomField({ projectId: p.id, name: 'Y', options: [{ name: 'A', colour: '#ff0000' }] })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('renames and reorders', async () => {
    const { project: p } = await project()
    const a = await createCustomField({ projectId: p.id, name: 'A' })
    const b = await createCustomField({ projectId: p.id, name: 'B' })
    expect((await renameCustomField(a.id, 'Audience')).name).toBe('Audience')
    expect((await reorderCustomFields(p.id, [b.id, a.id])).map(f => f.id)).toEqual([b.id, a.id])
    await expect(reorderCustomFields(p.id, [b.id])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('archiving hides a field and keeps its values; setting one is refused until it is back', async () => {
    const { project: p, make } = await project()
    const f = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Copy' }] })
    const t = await make('A')
    await setTaskFieldValue(t.id, f.id, f.options[0].id)
    await setCustomFieldArchived(f.id, true)
    expect(await listCustomFields(p.id)).toEqual([])
    expect(await prisma.taskFieldValue.count({ where: { fieldId: f.id } })).toBe(1)
    await expect(setTaskFieldValue(t.id, f.id, null)).rejects.toMatchObject({ statusCode: 400 })
    await setCustomFieldArchived(f.id, false)
    expect(await taskFieldValues(t.id)).toEqual([{ fieldId: f.id, optionId: f.options[0].id }])
  })

  it('deleting a field takes its values and its boards, and no task', async () => {
    const { project: p, make } = await project()
    const f = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Copy' }] })
    const t = await make('A')
    await setTaskFieldValue(t.id, f.id, f.options[0].id)
    await saveBoard({ projectId: p.id, name: 'Stages', kind: 'FIELD', fieldId: f.id })
    expect(await customFieldUse(f.id)).toEqual({ taskCount: 1, boardCount: 1 })
    await deleteCustomField(f.id)
    expect(await prisma.board.count({ where: { fieldId: f.id } })).toBe(0)
    expect(await prisma.task.findUnique({ where: { id: t.id } })).not.toBeNull()
  })
})

describe('options', () => {
  it('adds, renames, recolours, reorders and removes; a task with a removed option has no value', async () => {
    const { project: p, make } = await project()
    const f = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Copy' }] })
    const withTwo = await addFieldOption({ fieldId: f.id, name: 'Live', colour: 'success' })
    const [copy, live] = withTwo.options
    await expect(addFieldOption({ fieldId: f.id, name: 'LIVE' })).rejects.toMatchObject({ statusCode: 409 })
    expect((await updateFieldOption({ optionId: live.id, name: 'Shipped', colour: 'warning' })).options[1]).toMatchObject({ name: 'Shipped', colour: 'warning' })
    expect((await reorderFieldOptions(f.id, [live.id, copy.id])).options.map(o => o.id)).toEqual([live.id, copy.id])
    const t = await make('A')
    await setTaskFieldValue(t.id, f.id, live.id)
    await removeFieldOption(live.id)
    expect(await taskFieldValues(t.id)).toEqual([])
  })
})

describe('a task\'s values', () => {
  it('one option per field, changed or cleared, never touching the state, recorded in its activity', async () => {
    const { person, project: p, make } = await project()
    const f = await createCustomField({ projectId: p.id, name: 'Stage', options: [{ name: 'Copy' }, { name: 'Live' }] })
    const t = await make('A')
    await setTaskFieldValue(t.id, f.id, f.options[0].id, { kind: 'person', userId: person.id })
    expect(await setTaskFieldValue(t.id, f.id, f.options[1].id)).toEqual([{ fieldId: f.id, optionId: f.options[1].id }])
    expect(await setTaskFieldValue(t.id, f.id, null)).toEqual([])
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('BACKLOG')
    expect(await prisma.taskActivity.count({ where: { taskId: t.id, kind: 'EDITED' } })).toBe(3)
  })

  it('refuses another project\'s field, and an option of another field', async () => {
    const { project: p, make } = await project()
    const other = await createProject()
    const theirs = await createCustomField({ projectId: other.id, name: 'Theirs', options: [{ name: 'X' }] })
    const a = await createCustomField({ projectId: p.id, name: 'A', options: [{ name: 'One' }] })
    const b = await createCustomField({ projectId: p.id, name: 'B', options: [{ name: 'Two' }] })
    const t = await make('T')
    await expect(setTaskFieldValue(t.id, theirs.id, theirs.options[0].id)).rejects.toMatchObject({ message: FIELD_NOT_IN_PROJECT })
    await expect(setTaskFieldValue(t.id, a.id, b.options[0].id)).rejects.toMatchObject({ message: OPTION_NOT_OF_FIELD })
  })
})
