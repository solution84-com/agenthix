/**
 * Setting up, making a task, and editing a routine against Postgres (spec §3). Each takes someone who works in the
 * project, not its Viewer (adr-0102); editing is for the routine's person or a project admin; only a project admin takes
 * one over.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { createRoutine, makeTaskRoutine, updateRoutine } from '../routineActions'
import { ROUTINE_LOST_ACCESS_REASON } from '../routines'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { DAILY, addMember, assignAgent, boardOf, ctx, privateProject, refusedWith, routineIn, taskIn } from './automationWorld'

const HOUR = 3_600_000
const IN_30H = () => new Date(Math.floor((Date.now() + 30 * HOUR) / 60_000) * 60_000)
const TEMPLATE = { title: 'Board review' }
const SCHEDULE = () => ({ rule: DAILY, at: IN_30H().toISOString(), timezone: 'UTC' })
const MISSING = '00000000-0000-4000-8000-000000000000'

/** A private project with an operator who is a plain member and has a routine of their own, and a project admin. */
async function world() {
  const project = await privateProject()
  const owner = await createUserWithRole('MEMBER')
  const admin = await createUserWithRole('MEMBER')
  const other = await createUserWithRole('MEMBER')
  await addMember(project.id, owner.id)
  await addMember(project.id, admin.id, 'ADMIN')
  await addMember(project.id, other.id)
  const made = await createRoutine({ projectId: project.id, template: TEMPLATE, schedule: SCHEDULE() }, ctx(owner))
  const routine = (await prisma.routine.findUnique({ where: { id: made.id } }))!
  return { project, owner, admin, other, routine }
}

const waitingRound = (routineId: string) => prisma.task.findMany({ where: { routineId, roundAt: { gt: new Date() } } })

describe('createRoutine', () => {
  const args = (projectId: string) => ({ projectId, template: TEMPLATE, schedule: SCHEDULE() })

  it('refuses nobody signed in', async () => {
    const project = await privateProject()
    await refusedWith(createRoutine(args(project.id), ctx()), 401)
  })

  it("refuses a non-member, and the project's Viewer", async () => {
    const project = await privateProject()
    const outsider = await createUserWithRole('MEMBER')
    const viewer = await createUserWithRole('ADMIN')
    await addMember(project.id, viewer.id, 'VIEWER')
    await refusedWith(createRoutine(args(project.id), ctx(outsider)), 403)
    await refusedWith(createRoutine(args(project.id), ctx(viewer)), 403)
    expect(await prisma.routine.count()).toBe(0)
  })

  it.each([
    ['no repeat', { schedule: { rule: null } }],
    ['a repeat under the 5-minute floor', { schedule: { rule: { kind: 'interval', every: 1, unit: 'minutes' } } }],
    ['an empty title', { template: { title: '  ' } }],
    ['a priority that is none', { template: { title: 'x', priority: 'urgent' } }],
    ['a board that does not exist', { template: { title: 'x', boardId: MISSING } }],
    ['an agent that does not exist', { template: { title: 'x', assignedAgentId: MISSING } }],
  ])('refuses %s, creating nothing', async (_what, patch) => {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    await refusedWith(createRoutine({ ...args(project.id), ...patch } as any, ctx(person)), 400)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('refuses an agent that exists but is not assigned to the project, creating nothing', async () => {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    const agent = await createAgent()
    await refusedWith(createRoutine({ ...args(project.id), template: { title: 'x', assignedAgentId: agent.id } } as any, ctx(person)), 400)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('sets the routine up on, for its creator, with its first round waiting at its first time', async () => {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)
    const board = await boardOf(project.id)
    const at = IN_30H()
    const { id } = await createRoutine({
      projectId: project.id, template: { title: ' Board review ', priority: 'high', labels: ['ops'], assignedAgentId: agent.id, boardId: board.id, column: 'todo' },
      schedule: { rule: DAILY, at: at.toISOString(), timezone: 'UTC' },
    }, ctx(person))
    expect(await prisma.routine.findUnique({ where: { id } })).toMatchObject({
      projectId: project.id, title: 'Board review', priority: 'HIGH', labels: ['ops'], assignedAgentId: agent.id, boardId: board.id,
      column: 'todo', enabled: true, nextRoundAt: at, onBehalfOfUserId: person.id, createdByUserId: person.id, createdByAgentId: null,
    })
    const rounds = await prisma.task.findMany({ where: { routineId: id } })
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toMatchObject({ roundAt: at, runState: 'RUN_NONE', column: 'todo', boardId: board.id, onBehalfOfUserId: person.id })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })
})

describe('makeTaskRoutine', () => {
  async function taskWorld() {
    const project = await privateProject()
    const person = await createUserWithRole('MEMBER')
    await addMember(project.id, person.id)
    const task = await taskIn(project.id, { title: 'Weekly report', onBehalfOfUserId: person.id, priority: 'HIGH' })
    return { project, person, task }
  }

  it("refuses nobody signed in, an unknown task, an outsider and the project's Viewer", async () => {
    const { project, person, task } = await taskWorld()
    const outsider = await createUserWithRole('MEMBER')
    const viewer = await createUserWithRole('ADMIN')
    await addMember(project.id, viewer.id, 'VIEWER')
    await refusedWith(makeTaskRoutine({ taskId: task.id, schedule: SCHEDULE() }, ctx()), 401)
    await refusedWith(makeTaskRoutine({ taskId: MISSING, schedule: SCHEDULE() }, ctx(person)), 404)
    await refusedWith(makeTaskRoutine({ taskId: task.id, schedule: SCHEDULE() }, ctx(outsider)), 403)
    await refusedWith(makeTaskRoutine({ taskId: task.id, schedule: SCHEDULE() }, ctx(viewer)), 403)
  })

  it('refuses a member who is not the task\'s person or a project admin', async () => {
    const { project, task } = await taskWorld()
    const other = await createUserWithRole('MEMBER')
    await addMember(project.id, other.id)
    await refusedWith(makeTaskRoutine({ taskId: task.id, schedule: SCHEDULE() }, ctx(other)), 403)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('refuses a task that is already a round, a task blocked for lost access, and a schedule with no repeat', async () => {
    const { project, person, task } = await taskWorld()
    const round = await taskIn(project.id, { onBehalfOfUserId: person.id, routineId: (await routineIn(project.id, person.id)).id })
    const blocked = await taskIn(project.id, { onBehalfOfUserId: person.id, runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    await refusedWith(makeTaskRoutine({ taskId: round.id, schedule: SCHEDULE() }, ctx(person)), 400)
    await refusedWith(makeTaskRoutine({ taskId: blocked.id, schedule: SCHEDULE() }, ctx(person)), 400)
    await refusedWith(makeTaskRoutine({ taskId: task.id, schedule: { rule: null } }, ctx(person)), 400)
  })

  it('makes a routine from the task\'s own template, links the task, and creates the first round at the next time', async () => {
    const { project, person, task } = await taskWorld()
    const at = IN_30H()
    const { id } = await makeTaskRoutine({ taskId: task.id, schedule: { rule: DAILY, at: at.toISOString(), timezone: 'UTC' } }, ctx(person))
    expect(await prisma.routine.findUnique({ where: { id } })).toMatchObject({
      projectId: project.id, title: 'Weekly report', priority: 'HIGH', nextRoundAt: at, onBehalfOfUserId: person.id,
    })
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.routineId).toBe(id)
    expect(await prisma.task.count({ where: { routineId: id, roundAt: at } })).toBe(1)
  })

  it('with a start time still to come, the task itself becomes the first round at that time', async () => {
    const { person, task } = await taskWorld()
    const start = IN_30H()
    await prisma.task.update({ where: { id: task.id }, data: { scheduleAt: start, scheduleNextDueAt: start } })
    const { id } = await makeTaskRoutine({ taskId: task.id, schedule: { rule: DAILY, timezone: 'UTC' } }, ctx(person))
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      routineId: id, roundAt: start, scheduleAt: null, scheduleNextDueAt: null,
    })
    expect(await prisma.task.count({ where: { routineId: id } })).toBe(1)
  })
})

describe('updateRoutine', () => {
  it('refuses nobody signed in, an unknown routine, an outsider, and a member who is not its person or a project admin', async () => {
    const { routine, other } = await world()
    const outsider = await createUserWithRole('MEMBER')
    await refusedWith(updateRoutine({ routineId: routine.id, template: TEMPLATE }, ctx()), 401)
    await refusedWith(updateRoutine({ routineId: MISSING, template: TEMPLATE }, ctx(other)), 404)
    await refusedWith(updateRoutine({ routineId: routine.id, template: TEMPLATE }, ctx(outsider)), 403)
    await refusedWith(updateRoutine({ routineId: routine.id, template: { title: 'Changed' } }, ctx(other)), 403)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.title).toBe('Board review')
  })

  it("refuses its person once they are the project's Viewer", async () => {
    const { routine, owner } = await world()
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: routine.projectId, userId: owner.id } }, data: { role: 'VIEWER' } })
    await refusedWith(updateRoutine({ routineId: routine.id, template: { title: 'Changed' } }, ctx(owner)), 403)
  })

  it('refuses a template the project cannot take and a schedule with no repeat', async () => {
    const { routine, owner } = await world()
    await refusedWith(updateRoutine({ routineId: routine.id, template: { title: '' } }, ctx(owner)), 400)
    await refusedWith(updateRoutine({ routineId: routine.id, schedule: { rule: null } }, ctx(owner)), 400)
  })

  it('updates the routine and its waiting round together; a new schedule moves the round to the new time', async () => {
    const { project, routine, owner } = await world()
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)
    const at = new Date(IN_30H().getTime() + 5 * HOUR)
    expect(await updateRoutine({
      routineId: routine.id,
      template: { title: 'Triage', assignedAgentId: agent.id, priority: 'low' },
      schedule: { rule: { kind: 'interval', every: 2, unit: 'days' }, at: at.toISOString(), timezone: 'UTC' },
    }, ctx(owner))).toEqual({ id: routine.id })
    expect(await prisma.routine.findUnique({ where: { id: routine.id } })).toMatchObject({
      title: 'Triage', assignedAgentId: agent.id, priority: 'LOW', nextRoundAt: at,
    })
    const waiting = await waitingRound(routine.id)
    expect(waiting).toHaveLength(1)
    expect(waiting[0]).toMatchObject({ title: 'Triage', assignedAgentId: agent.id, priority: 'LOW', roundAt: at })
  })

  it('lets a project admin edit someone else\'s routine, but not choose who it is done on behalf of unless they are an admin', async () => {
    const { routine, admin, owner, other } = await world()
    await updateRoutine({ routineId: routine.id, template: { title: 'By admin' }, onBehalfOfUserId: owner.id }, ctx(admin))
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.title).toBe('By admin')
    await refusedWith(updateRoutine({ routineId: routine.id, onBehalfOfUserId: other.id }, ctx(owner)), 403)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.onBehalfOfUserId).toBe(owner.id)
  })

  it('a project admin takes it over: refused for a person with no access to the project, otherwise given to them', async () => {
    const { routine, admin, other } = await world()
    const stranger = await createUser()
    await refusedWith(updateRoutine({ routineId: routine.id, onBehalfOfUserId: stranger.id }, ctx(admin)), 400)
    await updateRoutine({ routineId: routine.id, onBehalfOfUserId: other.id }, ctx(admin))
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.onBehalfOfUserId).toBe(other.id)
    expect((await waitingRound(routine.id))[0].onBehalfOfUserId).toBe(other.id)
  })

  it('taking over a routine paused for lost access turns it back on and releases its blocked round to the new person', async () => {
    const { routine, admin, other } = await world()
    const [round] = await waitingRound(routine.id)
    await prisma.routine.update({ where: { id: routine.id }, data: { enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON } })
    await prisma.task.update({ where: { id: round.id }, data: { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON } })
    await updateRoutine({ routineId: routine.id, onBehalfOfUserId: other.id }, ctx(admin))
    expect(await prisma.routine.findUnique({ where: { id: routine.id } })).toMatchObject({ enabled: true, pausedReason: null, onBehalfOfUserId: other.id })
    expect(await prisma.task.findUnique({ where: { id: round.id } })).toMatchObject({ runState: 'RUN_NONE', runStateReason: null, onBehalfOfUserId: other.id })
  })
})
