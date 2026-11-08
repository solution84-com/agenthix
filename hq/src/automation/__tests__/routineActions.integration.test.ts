/**
 * A person's routine actions (adr-0177, N6) against the real test database: anyone who may work in the project makes
 * or changes a routine, and it then runs on their behalf; a Viewer and an outsider change nothing; Run now is one run
 * for whoever pressed it; a routine is read by anyone who can see the project.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../routineDispatch', async () => {
  const { prisma } = await import('../../test/db')
  return {
    dispatchRoutineRun: vi.fn(async (s: { routineRunId: string; number: number }) => {
      await prisma.routineRun.update({ where: { id: s.routineRunId }, data: { sessionId: `session-${s.routineRunId}`, siteId: 'site-1' } })
      return { runId: `run-${s.number}`, sessionId: `session-${s.routineRunId}`, siteId: 'site-1' }
    }),
  }
})
vi.mock('../../notifications/persistent', () => ({
  raisePersistentNotification: vi.fn(async () => undefined), clearPersistentNotification: vi.fn(async () => undefined),
}))

import { createRoutine, deleteRoutine, runRoutineNow, updateRoutine } from '../routineActions'
import { getProjectRoutines, readRoutine } from '../routineQueries'
import { addMember, assignAgent, createProjectWithUsers, ctx, refusedWith } from './automationWorld'

const ROUTINE = { title: 'Weekly link check', agentId: 'agent-1', instructions: 'Check the links', cron: '0 9 * * 1-5', timezone: 'Europe/London' }

async function world() {
  const { project, users } = await createProjectWithUsers()
  const viewer = await prisma.user.create({ data: {} })
  const outsider = await prisma.user.create({ data: {} })
  await addMember(project.id, users.person.id)
  await addMember(project.id, users.member.id)
  await addMember(project.id, viewer.id, 'VIEWER')
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Reviewer', handle: 'reviewer' } })
  await assignAgent(project.id, 'agent-1')
  const { id } = await createRoutine({ projectId: project.id, ...ROUTINE }, ctx(users.person))
  return { project, routineId: id, viewer, outsider, ...users }
}

const routineOf = (id: string) => prisma.routine.findUniqueOrThrow({ where: { id } })

describe('who may make and change a routine (N6)', () => {
  it('a member changes another member\'s routine, and it then runs on their behalf', async () => {
    const { routineId, member } = await world()
    await updateRoutine({ routineId, instructions: 'Check every link' }, ctx(member))
    expect(await routineOf(routineId)).toMatchObject({ instructions: 'Check every link', onBehalfOfUserId: member.id })
  })

  it('switching it off or on is a change too', async () => {
    const { routineId, member, person } = await world()
    await updateRoutine({ routineId, enabled: false }, ctx(member))
    expect(await routineOf(routineId)).toMatchObject({ enabled: false, onBehalfOfUserId: member.id })
    await updateRoutine({ routineId, enabled: true }, ctx(person))
    expect(await routineOf(routineId)).toMatchObject({ enabled: true, onBehalfOfUserId: person.id })
  })

  it('a Viewer and someone outside the project change nothing, Run now and delete included', async () => {
    const { routineId, viewer, outsider, person, project } = await world()
    for (const who of [viewer, outsider]) {
      await refusedWith(updateRoutine({ routineId, enabled: false }, ctx(who)), 403)
      await refusedWith(runRoutineNow({ routineId }, ctx(who)), 403)
      await refusedWith(deleteRoutine({ routineId }, ctx(who)), 403)
      await refusedWith(createRoutine({ projectId: project.id, ...ROUTINE }, ctx(who)), 403)
    }
    expect(await routineOf(routineId)).toMatchObject({ enabled: true, onBehalfOfUserId: person.id })
    expect(await prisma.routineRun.count()).toBe(0)
  })

  it('refuses what is not a routine with a 400, and a caller who is not signed in with a 401', async () => {
    const { routineId, member, project } = await world()
    await refusedWith(updateRoutine({ routineId, cron: '*/1 * * * *' }, ctx(member)), 400)
    await refusedWith(updateRoutine({ routineId, agentId: 7 as never }, ctx(member)), 400)
    await refusedWith(createRoutine({ projectId: project.id, ...ROUTINE, title: 42 as never }, ctx(member)), 400)
    await refusedWith(updateRoutine({ routineId, enabled: false }, ctx(null)), 401)
  })
})

describe('Run now (N6)', () => {
  it('is one run on behalf of whoever pressed it, and the routine stays whose it was', async () => {
    const { routineId, member, person } = await world()
    const res = await runRoutineNow({ routineId }, ctx(member))
    expect(res).toMatchObject({ state: 'RUNNING' })
    expect(await prisma.routineRun.findUniqueOrThrow({ where: { id: res.routineRunId } }))
      .toMatchObject({ startedByUserId: member.id, onBehalfOfUserId: member.id, dueAt: null })
    expect((await routineOf(routineId)).onBehalfOfUserId).toBe(person.id)
    await refusedWith(runRoutineNow({ routineId }, ctx(person)), 400)
  })
})

describe('reading routines', () => {
  it('a Viewer reads them, told they may not change them; its runs come newest first with who started each', async () => {
    const { project, routineId, viewer, member } = await world()
    await runRoutineNow({ routineId }, ctx(member))
    const [summary] = await getProjectRoutines({ projectId: project.id }, ctx(viewer))
    expect(summary).toMatchObject({
      id: routineId, canChange: false, scheduleWords: 'At 09:00, Monday to Friday, London time',
      agent: { id: 'agent-1', name: 'Reviewer' }, lastRuns: [expect.objectContaining({ number: 1, startedBy: expect.objectContaining({ userId: member.id }) })],
    })
    const detail = await readRoutine(routineId, member.id)
    expect(detail).toMatchObject({ canChange: true, instructions: 'Check the links', nextTimes: expect.any(Array), runs: [expect.objectContaining({ number: 1 })] })
    expect(detail.nextTimes).toHaveLength(3)
  })

  it('someone outside the project reads nothing', async () => {
    const { project, routineId, outsider } = await world()
    await refusedWith(getProjectRoutines({ projectId: project.id }, ctx(outsider)), 403)
    await expect(readRoutine(routineId, outsider.id)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('deleting a routine', () => {
  it('takes its record of runs with it', async () => {
    const { routineId, member } = await world()
    await runRoutineNow({ routineId }, ctx(member))
    await deleteRoutine({ routineId }, ctx(member))
    expect(await prisma.routine.count()).toBe(0)
    expect(await prisma.routineRun.count()).toBe(0)
  })
})
