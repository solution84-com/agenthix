/** Pausing, turning on and deleting a routine, and unlinking a round, against Postgres (spec §3): for the routine's person or a project admin. */
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

import { createRoutine, pauseRoutine, resumeRoutine, deleteRoutine, unlinkRoutineRound } from '../routineActions'
import { ROUTINE_LOST_ACCESS_REASON } from '../routines'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { DAILY, addMember, boardOf, ctx, privateProject, refusedWith, routineIn, taskIn } from './automationWorld'

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

describe('pauseRoutine', () => {
  it('refuses nobody signed in, an unknown routine, an outsider, and a member who is not its person or a project admin', async () => {
    const { routine, other } = await world()
    const outsider = await createUserWithRole('MEMBER')
    await refusedWith(pauseRoutine({ routineId: routine.id }, ctx()), 401)
    await refusedWith(pauseRoutine({ routineId: MISSING }, ctx(other)), 404)
    await refusedWith(pauseRoutine({ routineId: routine.id }, ctx(outsider)), 403)
    await refusedWith(pauseRoutine({ routineId: routine.id }, ctx(other)), 403)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.enabled).toBe(true)
  })

  it('pauses it and removes the waiting round; a project admin may pause another person\'s', async () => {
    const { routine, owner } = await world()
    await pauseRoutine({ routineId: routine.id }, ctx(owner))
    expect(await prisma.routine.findUnique({ where: { id: routine.id } })).toMatchObject({ enabled: false, nextRoundAt: null })
    expect(await prisma.task.count({ where: { routineId: routine.id } })).toBe(0)

    const second = await world()
    await pauseRoutine({ routineId: second.routine.id }, ctx(second.admin))
    expect((await prisma.routine.findUnique({ where: { id: second.routine.id } }))!.enabled).toBe(false)
  })

  it('keeps a round someone already started, as no longer waiting', async () => {
    const { routine, owner } = await world()
    const [round] = await waitingRound(routine.id)
    await prisma.task.update({ where: { id: round.id }, data: { runState: 'RUN_ACTIVE' } })
    await pauseRoutine({ routineId: routine.id }, ctx(owner))
    expect(await prisma.task.findUnique({ where: { id: round.id } })).toMatchObject({ roundAt: null, runState: 'RUN_ACTIVE' })
  })
})

describe('resumeRoutine', () => {
  it("refuses nobody signed in, an unknown routine, an outsider, a member who is not its person, and its person made the project's Viewer", async () => {
    const { routine, other, owner } = await world()
    const outsider = await createUserWithRole('MEMBER')
    await refusedWith(resumeRoutine({ routineId: routine.id }, ctx()), 401)
    await refusedWith(resumeRoutine({ routineId: MISSING }, ctx(other)), 404)
    await refusedWith(resumeRoutine({ routineId: routine.id }, ctx(outsider)), 403)
    await refusedWith(resumeRoutine({ routineId: routine.id }, ctx(other)), 403)
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: routine.projectId, userId: owner.id } }, data: { role: 'VIEWER' } })
    await refusedWith(resumeRoutine({ routineId: routine.id }, ctx(owner)), 403)
  })

  it('refuses a routine paused for lost access: only a project admin taking it over turns it on', async () => {
    const { routine, owner } = await world()
    await prisma.routine.update({ where: { id: routine.id }, data: { enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON, nextRoundAt: null } })
    await refusedWith(resumeRoutine({ routineId: routine.id }, ctx(owner)), 400)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.enabled).toBe(false)
  })

  it('turns a paused routine back on with a fresh round for its next time', async () => {
    const { routine, owner } = await world()
    await pauseRoutine({ routineId: routine.id }, ctx(owner))
    await resumeRoutine({ routineId: routine.id }, ctx(owner))
    const row = (await prisma.routine.findUnique({ where: { id: routine.id } }))!
    expect(row).toMatchObject({ enabled: true, pausedReason: null })
    expect(row.nextRoundAt!.getTime()).toBeGreaterThan(Date.now())
    const waiting = await waitingRound(routine.id)
    expect(waiting).toHaveLength(1)
    expect(waiting[0].roundAt).toEqual(row.nextRoundAt)
  })
})

describe('deleteRoutine', () => {
  it('refuses nobody signed in, an unknown routine, an outsider, and a member who is not its person or a project admin', async () => {
    const { routine, other } = await world()
    const outsider = await createUserWithRole('MEMBER')
    await refusedWith(deleteRoutine({ routineId: routine.id }, ctx()), 401)
    await refusedWith(deleteRoutine({ routineId: MISSING }, ctx(other)), 404)
    await refusedWith(deleteRoutine({ routineId: routine.id }, ctx(outsider)), 403)
    await refusedWith(deleteRoutine({ routineId: routine.id }, ctx(other)), 403)
    expect(await prisma.routine.count({ where: { id: routine.id } })).toBe(1)
  })

  it('deletes the routine and its waiting round; earlier rounds stay, no longer linked', async () => {
    const { project, routine, owner } = await world()
    const earlier = await taskIn(project.id, { onBehalfOfUserId: owner.id, routineId: routine.id, roundAt: new Date('2026-01-01T09:00:00Z') })
    await deleteRoutine({ routineId: routine.id }, ctx(owner))
    expect(await prisma.routine.count({ where: { id: routine.id } })).toBe(0)
    expect(await prisma.task.findUnique({ where: { id: earlier.id } })).toMatchObject({ routineId: null })
    expect(await prisma.task.count({ where: { title: 'Board review', roundAt: { gt: new Date() } } })).toBe(0)
  })
})

describe('unlinkRoutineRound', () => {
  it('refuses a task that is no round, whoever asks', async () => {
    const { project, owner } = await world()
    const plain = await taskIn(project.id, { onBehalfOfUserId: owner.id })
    await refusedWith(unlinkRoutineRound({ taskId: plain.id }, ctx(owner)), 400)
    await refusedWith(unlinkRoutineRound({ taskId: MISSING }, ctx(owner)), 400)
  })

  it('refuses nobody signed in, an outsider, and a member who is not the routine\'s person or a project admin', async () => {
    const { routine, other } = await world()
    const outsider = await createUserWithRole('MEMBER')
    const [round] = await waitingRound(routine.id)
    await refusedWith(unlinkRoutineRound({ taskId: round.id }, ctx()), 401)
    await refusedWith(unlinkRoutineRound({ taskId: round.id }, ctx(outsider)), 403)
    await refusedWith(unlinkRoutineRound({ taskId: round.id }, ctx(other)), 403)
    expect((await prisma.task.findUnique({ where: { id: round.id } }))!.routineId).toBe(routine.id)
  })

  it('unlinks the waiting round into a plain scheduled task, and the routine creates the round for the time after', async () => {
    const { routine, owner } = await world()
    const [round] = await waitingRound(routine.id)
    await unlinkRoutineRound({ taskId: round.id }, ctx(owner))
    expect(await prisma.task.findUnique({ where: { id: round.id } })).toMatchObject({
      routineId: null, roundAt: null, scheduleAt: round.roundAt, scheduleNextDueAt: round.roundAt, scheduleSetByUserId: owner.id,
    })
    const [next] = await waitingRound(routine.id)
    expect(next.id).not.toBe(round.id)
    expect(next.roundAt!.getTime()).toBe(round.roundAt!.getTime() + 24 * HOUR)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.nextRoundAt).toEqual(next.roundAt)
  })

  it('an earlier round is only no longer linked, and the routine keeps its one waiting round', async () => {
    const { project, routine, admin, owner } = await world()
    const earlier = await taskIn(project.id, { onBehalfOfUserId: owner.id, routineId: routine.id, roundAt: new Date('2026-01-01T09:00:00Z') })
    await unlinkRoutineRound({ taskId: earlier.id }, ctx(admin))
    expect(await prisma.task.findUnique({ where: { id: earlier.id } })).toMatchObject({ routineId: null })
    expect(await waitingRound(routine.id)).toHaveLength(1)
  })
})
