/**
 * Run now and Skip this time against Postgres (spec §3): Run now starts the
 * waiting round at once, as Run starts a task, by the person who pressed it,
 * and a fresh round waits for the same time; Skip this time removes the waiting
 * round and the routine moves on. Both for the routine's person or a project
 * admin. TaskRunner is the shared fake. Run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { createRoutine, runRoutineNow, skipRoutineRound } from '../routineActions'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { ctx as projectsCtx } from '../../projects/__tests__/projectsHarness'
import { DAILY, addMember, boardOf, privateProject, refusedWith } from './automationWorld'

const HOUR = 3_600_000
const IN_30H = () => new Date(Math.floor((Date.now() + 30 * HOUR) / 60_000) * 60_000)

async function world(withAgent = true) {
  const project = await privateProject()
  const [owner, admin, other] = await Promise.all([createUserWithRole('MEMBER'), createUserWithRole('MEMBER'), createUserWithRole('MEMBER')])
  await addMember(project.id, owner.id)
  await addMember(project.id, admin.id, 'ADMIN')
  await addMember(project.id, other.id)
  const board = await boardOf(project.id)
  const agent = await createAgent()
  const at = IN_30H()
  const made = await createRoutine({
    projectId: project.id,
    template: { title: 'Site audit', assignedAgentId: withAgent ? agent.id : null, boardId: board.id, column: 'todo' },
    schedule: { rule: DAILY, at: at.toISOString(), timezone: 'UTC' },
  }, projectsCtx(owner) as any)
  return { project, owner, admin, other, agent, at, routineId: made.id }
}

const rounds = (routineId: string) => prisma.task.findMany({ where: { routineId }, orderBy: { roundAt: 'asc' } })

describe('Run now @SC-685', () => {
  it('starts the waiting round at once, as Run does, by the person who pressed it; a fresh round waits for the same time', async () => {
    const { owner, agent, at, routineId } = await world()
    const [waiting] = await rounds(routineId)
    const before = Date.now()
    const { taskId } = await runRoutineNow({ routineId }, projectsCtx(owner) as any)
    expect(taskId).toBe(waiting.id)
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: waiting.id, startedBy: 'person', personId: owner.id, agent: expect.objectContaining({ id: agent.id }) })])
    const [ran, fresh] = await rounds(routineId)
    expect(ran.id).toBe(waiting.id)
    expect(ran.roundAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(ran).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: owner.id })
    expect(fresh).toMatchObject({ roundAt: at, runState: 'RUN_NONE' })
    expect((await prisma.routine.findUnique({ where: { id: routineId } }))!.nextRoundAt).toEqual(at)
  })

  it('is for the routine\'s person or a project admin, not another member', async () => {
    const { admin, other, routineId } = await world()
    await refusedWith(runRoutineNow({ routineId }, projectsCtx(other) as any), 403)
    await runRoutineNow({ routineId }, projectsCtx(admin) as any)
    expect(taskRunnerFake.startedTasks).toHaveLength(1)
  })

  it('refuses a round with no agent, and one already started, changing nothing', async () => {
    const none = await world(false)
    await refusedWith(runRoutineNow({ routineId: none.routineId }, projectsCtx(none.owner) as any), 400)
    expect(await rounds(none.routineId)).toHaveLength(1)

    const started = await world()
    const [waiting] = await rounds(started.routineId)
    await prisma.task.update({ where: { id: waiting.id }, data: { runState: 'RUN_ACTIVE', runId: 'run-1' } })
    await refusedWith(runRoutineNow({ routineId: started.routineId }, projectsCtx(started.owner) as any), 400)
    expect(await rounds(started.routineId)).toHaveLength(1)
    expect(taskRunnerFake.startedTasks).toEqual([])
  })

  it('refuses a paused routine: nothing is waiting', async () => {
    const { owner, routineId } = await world()
    await prisma.routine.update({ where: { id: routineId }, data: { enabled: false, nextRoundAt: null } })
    await refusedWith(runRoutineNow({ routineId }, projectsCtx(owner) as any), 400)
  })
})

describe('Skip this time @SC-685', () => {
  it('removes the waiting round, and the routine waits for the time after', async () => {
    const { owner, at, routineId } = await world()
    const [waiting] = await rounds(routineId)
    await skipRoutineRound({ routineId }, projectsCtx(owner) as any)
    const after = new Date(at.getTime() + 24 * HOUR)
    expect(await prisma.task.findUnique({ where: { id: waiting.id } })).toBeNull()
    expect((await rounds(routineId)).map(t => t.roundAt)).toEqual([after])
    expect((await prisma.routine.findUnique({ where: { id: routineId } }))!.nextRoundAt).toEqual(after)
  })

  it('refuses a round someone already started, and another member', async () => {
    const { owner, other, routineId } = await world()
    await refusedWith(skipRoutineRound({ routineId }, projectsCtx(other) as any), 403)
    const [waiting] = await rounds(routineId)
    await prisma.task.update({ where: { id: waiting.id }, data: { runState: 'RUN_QUEUED', runStartedBy: 'person' } })
    await refusedWith(skipRoutineRound({ routineId }, projectsCtx(owner) as any), 400)
    expect(await rounds(routineId)).toHaveLength(1)
  })
})
