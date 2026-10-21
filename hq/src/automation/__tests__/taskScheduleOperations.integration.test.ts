/** A task's start time against Postgres (spec §3): setting or clearing it is for the task's person or a project admin, and takes a role that can start runs. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { setTaskSchedule, clearTaskSchedule } from '../operations'
import { setSchedulerWake } from '../schedulerNudge'
import { addMember, boardOf, ctx, privateProject, refusedWith, taskIn } from './automationWorld'

const wake = vi.fn()
beforeEach(() => {
  wake.mockReset()
  setSchedulerWake(wake)
  return () => setSchedulerWake(null)
})

const FAR = () => new Date(Date.now() + 48 * 3_600_000)

describe('setTaskSchedule', () => {
  async function setUp() {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    const task = await taskIn(project.id, { onBehalfOfUserId: person.id })
    return { project, person, task }
  }

  it('refuses nobody signed in', async () => {
    const { task } = await setUp()
    await refusedWith(setTaskSchedule({ taskId: task.id, at: FAR().toISOString() }, ctx()), 401)
  })

  it('answers not found for a task that does not exist', async () => {
    const person = await createUserWithRole('MEMBER')
    await refusedWith(setTaskSchedule({ taskId: '00000000-0000-4000-8000-000000000000', at: FAR().toISOString() }, ctx(person)), 404)
  })

  it('refuses someone who is not a member of the task\'s project', async () => {
    const { task } = await setUp()
    const outsider = await createUserWithRole('MEMBER')
    await refusedWith(setTaskSchedule({ taskId: task.id, at: FAR().toISOString() }, ctx(outsider)), 403)
  })

  it("refuses the project's Viewer, the organisation's admin though they are", async () => {
    const { project, task } = await setUp()
    const viewer = await createUserWithRole('ADMIN')
    await addMember(project.id, viewer.id, 'VIEWER')
    await refusedWith(setTaskSchedule({ taskId: task.id, at: FAR().toISOString() }, ctx(viewer)), 403)
  })

  it('refuses a member who is neither the task\'s person nor a project admin, leaving the schedule unset', async () => {
    const { project, task } = await setUp()
    const other = await createUserWithRole('MEMBER')
    await addMember(project.id, other.id)
    await refusedWith(setTaskSchedule({ taskId: task.id, at: FAR().toISOString() }, ctx(other)), 403)
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.scheduleAt).toBeNull()
  })

  it.each([
    ['no time', undefined],
    ['a time that is not a time', 'tomorrow-ish'],
    ['a time already past', '2020-01-01T00:00:00Z'],
  ])('refuses %s', async (_what, at) => {
    const { person, task } = await setUp()
    await refusedWith(setTaskSchedule({ taskId: task.id, at }, ctx(person)), 400)
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.scheduleNextDueAt).toBeNull()
  })

  it('stores the time, the person behind it and when it is next due, and answers that time', async () => {
    const { person, task } = await setUp()
    const at = FAR()
    at.setSeconds(0, 0)
    const result = await setTaskSchedule({ taskId: task.id, at: at.toISOString() }, ctx(person))
    expect(result).toEqual({ nextDueAt: at.toISOString() })
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      scheduleAt: at, scheduleNextDueAt: at, onBehalfOfUserId: person.id, scheduleSetByUserId: person.id, scheduleSetByAgentId: null,
    })
  })

  it('lets a project admin set it, moving the task to be done on their behalf, and holds back a run already queued', async () => {
    const { project, task } = await setUp()
    const admin = await createUserWithRole('MEMBER')
    await addMember(project.id, admin.id, 'ADMIN')
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_QUEUED' } })
    await setTaskSchedule({ taskId: task.id, at: FAR().toISOString() }, ctx(admin))
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ onBehalfOfUserId: admin.id, runState: 'RUN_NONE' })
  })
})

describe('clearTaskSchedule', () => {
  async function scheduled() {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    const at = FAR()
    const task = await taskIn(project.id, {
      onBehalfOfUserId: person.id, scheduleAt: at, scheduleNextDueAt: at, scheduleSetByUserId: person.id,
    })
    return { project, person, task }
  }

  it('refuses nobody signed in', async () => {
    const { task } = await scheduled()
    await refusedWith(clearTaskSchedule({ taskId: task.id }, ctx()), 401)
  })

  it('answers not found for a task that does not exist', async () => {
    const person = await createUserWithRole('MEMBER')
    await refusedWith(clearTaskSchedule({ taskId: '00000000-0000-4000-8000-000000000000' }, ctx(person)), 404)
  })

  it('refuses an outsider, the project\'s Viewer, and a member who is not the task\'s person', async () => {
    const { project, task } = await scheduled()
    const outsider = await createUserWithRole('MEMBER')
    const viewer = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    await addMember(project.id, viewer.id, 'VIEWER')
    await addMember(project.id, other.id)
    await refusedWith(clearTaskSchedule({ taskId: task.id }, ctx(outsider)), 403)
    await refusedWith(clearTaskSchedule({ taskId: task.id }, ctx(viewer)), 403)
    await refusedWith(clearTaskSchedule({ taskId: task.id }, ctx(other)), 403)
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.scheduleAt).not.toBeNull()
  })

  it('clears the time and who set it, and answers nothing', async () => {
    const { person, task } = await scheduled()
    expect(await clearTaskSchedule({ taskId: task.id }, ctx(person))).toBeUndefined()
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      scheduleAt: null, scheduleNextDueAt: null, scheduleSetByUserId: null,
    })
  })

  it('queues the task when it sits in a column that queues automatically and has an agent: the column rule applies again', async () => {
    const { project, person, task } = await scheduled()
    const board = await boardOf(project.id)
    const agent = await prisma.agent.create({ data: { name: 'A', handle: 'a-clear' } })
    await prisma.task.update({
      where: { id: task.id }, data: { boardId: board.id, column: 'ready', assignedAgentId: agent.id },
    })
    await clearTaskSchedule({ taskId: task.id }, ctx(person))
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ runState: 'RUN_QUEUED', queuedByUserId: null })
    expect(wake).toHaveBeenCalled()
  })

  it('leaves a task in a plain column alone', async () => {
    const { project, person, task } = await scheduled()
    const board = await boardOf(project.id)
    const agent = await prisma.agent.create({ data: { name: 'A', handle: 'a-plain' } })
    await prisma.task.update({
      where: { id: task.id }, data: { boardId: board.id, column: 'todo', assignedAgentId: agent.id },
    })
    await clearTaskSchedule({ taskId: task.id }, ctx(person))
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.runState).toBe('RUN_NONE')
  })
})
