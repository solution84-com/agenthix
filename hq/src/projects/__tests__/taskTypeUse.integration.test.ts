/**
 * How a project's task types are used, for Settings › Task types (spec D10), against the real test DB: tasks and open
 * tasks per type, whether anything ever used it (archived tasks count), and the tasks each column holds.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

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
import { taskTypeUse } from '../taskTypeUse'
import { originByPerson } from '../taskOnBehalfOf'

describe('task type use', () => {
  it('counts tasks and open tasks per type, and an archived task still counts as use', async () => {
    const person = await createUser()
    const p = await createProject()
    const { TASK } = await ensureBuiltInTaskTypes(p.id)
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const fresh = await createTaskType({ projectId: p.id, name: 'Unused' })
    const make = (title: string, typeId: string) => createTask({ title, projectId: p.id, typeId, origin: originByPerson(person.id) })
    await make('One', TASK)
    const done = await make('Two', TASK)
    await prisma.task.update({ where: { id: done.id }, data: { state: 'DONE' } })
    const gone = await make('Old bug', bug.id)
    await prisma.task.update({ where: { id: gone.id }, data: { archived: true } })

    const use = await taskTypeUse(p.id)
    expect(use.find(u => u.typeId === TASK)).toMatchObject({ tasks: 2, open: 1, used: true })
    expect(use.find(u => u.typeId === bug.id)).toMatchObject({ tasks: 0, open: 0, used: true })
    expect(use.find(u => u.typeId === fresh.id)).toMatchObject({ tasks: 0, open: 0, used: false, madeFrom: null })
    const backlog = bug.columns.find(c => c.state === 'BACKLOG')!
    expect(use.find(u => u.typeId === bug.id)?.columns[backlog.id]).toBe(1)
  })
})
