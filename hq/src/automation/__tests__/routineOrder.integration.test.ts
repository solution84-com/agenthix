/**
 * Reordering a project's routines (the Routines design keys 12, 13) against the real test database: the order is the
 * project's, read back the same by everyone; a new routine goes last; a Viewer and an outsider move nothing; and a
 * list that is not exactly the project's routines is refused, changing nothing.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../routineDispatch', () => ({ dispatchRoutineRun: vi.fn() }))
vi.mock('../../notifications/persistent', () => ({
  raisePersistentNotification: vi.fn(async () => undefined), clearPersistentNotification: vi.fn(async () => undefined),
}))

import { createRoutine } from '../routineActions'
import { getProjectRoutines } from '../routineQueries'
import { reorderRoutines } from '../routineOrder'
import { addMember, assignAgent, createProjectWithUsers, ctx, refusedWith } from './automationWorld'

const ROUTINE = { agentId: 'agent-1', instructions: 'Check the links', cron: '0 9 * * 1-5', timezone: 'Europe/London' }

async function world() {
  const { project, users } = await createProjectWithUsers()
  const viewer = await prisma.user.create({ data: {} })
  const outsider = await prisma.user.create({ data: {} })
  await addMember(project.id, users.person.id)
  await addMember(project.id, users.member.id)
  await addMember(project.id, viewer.id, 'VIEWER')
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Reviewer', handle: 'reviewer' } })
  await assignAgent(project.id, 'agent-1')
  const ids: string[] = []
  for (const title of ['Links', 'Summary', 'Audit']) ids.push((await createRoutine({ projectId: project.id, title, ...ROUTINE }, ctx(users.person))).id)
  return { project, ids, viewer, outsider, ...users }
}

const titles = async (projectId: string, who: { id: string }) =>
  (await getProjectRoutines({ projectId }, ctx(who))).map(r => r.title)

describe("a project's routines in the order its people give them", () => {
  it('a new routine goes last, and a member moves one; everyone reads the same order', async () => {
    const { project, ids, member, viewer } = await world()
    expect(await titles(project.id, member)).toEqual(['Links', 'Summary', 'Audit'])
    await reorderRoutines({ projectId: project.id, routineIds: [ids[2], ids[0], ids[1]] }, ctx(member))
    expect(await titles(project.id, member)).toEqual(['Audit', 'Links', 'Summary'])
    expect(await titles(project.id, viewer)).toEqual(['Audit', 'Links', 'Summary'])
  })

  it('a Viewer and someone outside the project move nothing', async () => {
    const { project, ids, viewer, outsider, member } = await world()
    for (const who of [viewer, outsider]) {
      await refusedWith(reorderRoutines({ projectId: project.id, routineIds: [ids[2], ids[1], ids[0]] }, ctx(who)), 403)
    }
    expect(await titles(project.id, member)).toEqual(['Links', 'Summary', 'Audit'])
  })

  it('refuses a list that is not exactly the project\'s routines, and changes nothing', async () => {
    const { project, ids, member, person } = await world()
    const other = await createProjectWithUsers()
    await addMember(other.project.id, person.id)
    await assignAgent(other.project.id, 'agent-1')
    const foreign = (await createRoutine({ projectId: other.project.id, title: 'Elsewhere', ...ROUTINE }, ctx(person))).id
    for (const routineIds of [[ids[0], ids[1]], [ids[0], ids[1], ids[2], foreign], [ids[0], ids[1], foreign], [ids[0], ids[0], ids[1]]]) {
      await refusedWith(reorderRoutines({ projectId: project.id, routineIds }, ctx(member)), 409)
    }
    await refusedWith(reorderRoutines({ projectId: project.id, routineIds: 'all' as never }, ctx(member)), 400)
    expect(await titles(project.id, member)).toEqual(['Links', 'Summary', 'Audit'])
    expect((await prisma.routine.findUniqueOrThrow({ where: { id: foreign } })).position).toBe(0)
  })
})
