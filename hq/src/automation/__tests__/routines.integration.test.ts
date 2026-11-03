// Over 300 lines on purpose: every test builds on the one set-up and fixed clock above, and splitting would repeat both.
/**
 * A routine's life against Postgres (spec §3, adr-0092): set up, made from a task, edited, paused, turned back on,
 * deleted, a round unlinked or deleted, and paused for lost access. Whatever happens, an enabled routine keeps exactly
 * one round waiting for its next time. Every call takes a fixed `now`, so no test depends on the clock.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import {
  ROUTINE_LOST_ACCESS_REASON, createRoutine, deleteRoutine, makeRoutineFromTask, mayManageRoutine, pauseRoutine,
  pauseRoutinesForLostAccess, resumeRoutine, roundDeleted, unlinkRound, updateRoutine,
} from '../routines'
import { RoutineError, type RoutineTemplate } from '../routineTemplate'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { DAILY, addMember, assignAgent, boardOf, createProjectWithUsers, routineIn, taskIn } from './automationWorld'

const NOW = new Date('2026-10-05T08:00:00Z')
const NINE = '2026-10-01T09:00:00Z'
const NEXT = new Date('2026-10-05T09:00:00Z')
const AFTER = new Date('2026-10-06T09:00:00Z')
const TEMPLATE: RoutineTemplate = {
  title: 'Board review', description: null, priority: 'MEDIUM', labels: [], assignedAgentId: null, boardId: null, column: null, modelChoice: null,
}
const person = (userId: string) => ({ kind: 'person' as const, userId })

const roundsOf = (routineId: string) => prisma.task.findMany({ where: { routineId }, orderBy: { roundAt: 'asc' } })
const routineRow = (id: string) => prisma.routine.findUnique({ where: { id } })

/** A routine set up through the service, at `NOW`, with its first round waiting for 09:00. */
async function setUp(template: Partial<RoutineTemplate> = {}, agentId?: string) {
  const { project } = await createProjectWithUsers()
  if (agentId) await assignAgent(project.id, agentId)
  const routine = await createRoutine(project.id, { ...TEMPLATE, ...template }, { rule: DAILY, at: NINE, timezone: 'UTC' }, person('dana'), NOW)
  return { project, routine }
}

describe('setting a routine up', () => {
  it('turns it on with its first round waiting for its next time, on behalf of whoever set it up', async () => {
    const { project } = await createProjectWithUsers()
    const routine = await createRoutine(project.id, TEMPLATE, { rule: DAILY, at: NINE, timezone: 'UTC' }, person('dana'), NOW)
    expect(await routineRow(routine.id)).toMatchObject({
      projectId: project.id, title: 'Board review', enabled: true, nextRoundAt: NEXT, onBehalfOfUserId: 'dana', createdByUserId: 'dana',
      createdByAgentId: null, scheduleTimezone: 'UTC',
    })
    const rounds = await roundsOf(routine.id)
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toMatchObject({ roundAt: NEXT, runState: 'RUN_NONE', onBehalfOfUserId: 'dana', number: 1 })
  })

  it('records the agent and its session when an agent set it up for its person', async () => {
    const { project } = await createProjectWithUsers()
    const routine = await createRoutine(project.id, TEMPLATE, { rule: DAILY }, { kind: 'agent', agentId: 'ax', sessionId: 's1', userId: 'dana' }, NOW)
    expect(await routineRow(routine.id)).toMatchObject({
      onBehalfOfUserId: 'dana', createdByUserId: 'dana', createdByAgentId: 'ax', createdBySessionId: 's1',
    })
  })

  it.each([
    ['no repeat', null, /needs a repeat/],
    ['a repeat under the 5-minute floor', { kind: 'interval', every: 1, unit: 'minutes' }, /more often than every 5 minutes/],
  ])('refuses %s, creating nothing', async (_what, rule, message) => {
    const { project } = await createProjectWithUsers()
    await expect(createRoutine(project.id, TEMPLATE, { rule: rule as never }, person('dana'), NOW)).rejects.toThrow(message)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('refuses a board from another project — a routine\'s rounds start in its own', async () => {
    const { project } = await createProjectWithUsers()
    const { project: elsewhere } = await createProjectWithUsers()
    const board = await boardOf(elsewhere.id)
    await expect(createRoutine(project.id, { ...TEMPLATE, boardId: board.id }, { rule: DAILY }, person('dana'), NOW)).rejects.toBeInstanceOf(RoutineError)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('keeps its agent on the routine and its first round', async () => {
    const agent = await createAgent()
    const { routine } = await setUp({ assignedAgentId: agent.id }, agent.id)
    expect((await routineRow(routine.id))!.assignedAgentId).toBe(agent.id)
    expect((await roundsOf(routine.id))[0].assignedAgentId).toBe(agent.id)
  })
})

describe("a routine's agent is on its project's roster", () => {
  it('refuses an agent that exists but is not assigned to the project, creating nothing', async () => {
    const agent = await createAgent()
    const { project } = await createProjectWithUsers()
    await expect(createRoutine(project.id, { ...TEMPLATE, assignedAgentId: agent.id }, { rule: DAILY }, person('dana'), NOW))
      .rejects.toThrow(/not assigned to this project/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('refuses it on an edit too', async () => {
    const agent = await createAgent()
    const { routine } = await setUp()
    await expect(updateRoutine(routine.id, { template: { assignedAgentId: agent.id } }, NOW)).rejects.toBeInstanceOf(RoutineError)
  })

  it('leaves the round unassigned when the agent has left the roster since', async () => {
    const agent = await createAgent()
    const { project, routine } = await setUp({ assignedAgentId: agent.id }, agent.id)
    await prisma.projectAgent.deleteMany({ where: { projectId: project.id, agentId: agent.id } })
    await prisma.routine.update({ where: { id: routine.id }, data: { assignedAgentId: agent.id } })
    await prisma.task.deleteMany({ where: { routineId: routine.id } })
    await resumeRoutine(routine.id, NOW)
    expect((await roundsOf(routine.id))[0].assignedAgentId).toBeNull()
  })
})

describe('"Make this a routine"', () => {
  const EXISTING = { title: 'Weekly report', description: 'x', priority: 'HIGH', labels: ['r'], onBehalfOfUserId: 'dana' }

  it('with a start time still to come, the task becomes the first round at that time — no other round is created', async () => {
    const { project } = await createProjectWithUsers()
    const at = new Date('2026-10-06T14:00:00Z')
    const task = await taskIn(project.id, { ...EXISTING, scheduleAt: at, scheduleNextDueAt: at, scheduleSetByUserId: 'erin' })
    const routine = await makeRoutineFromTask(task.id, { rule: DAILY, at: NINE }, person('dana'), NOW)
    expect(await routineRow(routine.id)).toMatchObject({ title: 'Weekly report', priority: 'HIGH', labels: ['r'], nextRoundAt: at })
    expect(await roundsOf(routine.id)).toEqual([
      expect.objectContaining({ id: task.id, roundAt: at, scheduleAt: null, scheduleNextDueAt: null, scheduleSetByUserId: null, onBehalfOfUserId: 'dana' }),
    ])
  })

  it('otherwise links the task and creates the first round at the next time', async () => {
    const { project } = await createProjectWithUsers()
    const task = await taskIn(project.id, EXISTING)
    const routine = await makeRoutineFromTask(task.id, { rule: DAILY, at: NINE }, person('dana'), NOW)
    const rounds = await roundsOf(routine.id)
    expect(rounds).toHaveLength(2)
    expect(rounds.find(t => t.id === task.id)).toMatchObject({ routineId: routine.id, roundAt: null, onBehalfOfUserId: 'dana' })
    expect(rounds.find(t => t.id !== task.id)).toMatchObject({ roundAt: NEXT, title: 'Weekly report' })
  })

  it.each([
    ['unknown', async () => 'no-such-task', /not found/],
    ['already a round', async (projectId: string) => (await taskIn(projectId, { routineId: (await routineIn(projectId, 'dana')).id })).id, /already a round/],
    ['blocked because its person lost access', async (projectId: string) =>
      (await taskIn(projectId, { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })).id, /blocked/],
  ])('refuses a task %s', async (_what, make, message) => {
    const { project } = await createProjectWithUsers()
    const taskId = await make(project.id)
    const before = await prisma.routine.count()
    await expect(makeRoutineFromTask(taskId, { rule: DAILY }, person('dana'), NOW)).rejects.toThrow(message)
    expect(await prisma.routine.count()).toBe(before)
  })
})

describe('its waiting round follows the routine', () => {
  it('editing updates the waiting round; a new schedule moves it to the new next time', async () => {
    const { routine } = await setUp()
    await updateRoutine(routine.id, { template: { title: 'Triage' }, schedule: { rule: { kind: 'interval', every: 2, unit: 'hours' }, at: '2026-10-05T07:00:00Z' } }, NOW)
    const rounds = await roundsOf(routine.id)
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toMatchObject({ title: 'Triage', roundAt: NEXT })
    expect((await routineRow(routine.id))!.nextRoundAt).toEqual(NEXT)
  })

  it('moving the routine to another board moves the waiting round onto it', async () => {
    const { project, routine } = await setUp()
    const board = await boardOf(project.id)
    await updateRoutine(routine.id, { template: { boardId: board.id, column: 'ready' } }, NOW)
    expect((await roundsOf(routine.id))[0]).toMatchObject({ boardId: board.id, column: 'ready' })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it("editing its agent updates the waiting round's agent", async () => {
    const agent = await createAgent()
    const { project, routine } = await setUp()
    await assignAgent(project.id, agent.id)
    await updateRoutine(routine.id, { template: { assignedAgentId: agent.id } }, NOW)
    expect((await routineRow(routine.id))!.assignedAgentId).toBe(agent.id)
    expect((await roundsOf(routine.id))[0].assignedAgentId).toBe(agent.id)
  })

  it('refuses an edit to an unknown routine, and one that names a column its board lacks', async () => {
    const { project, routine } = await setUp()
    const board = await boardOf(project.id)
    await expect(updateRoutine('no-such-routine', {}, NOW)).rejects.toThrow(/not found/)
    await expect(updateRoutine(routine.id, { template: { boardId: board.id, column: 'nowhere' } }, NOW)).rejects.toThrow(/not a column/)
  })

  it('pausing removes the waiting round, and keeps one a person already started — as no longer waiting', async () => {
    const { project, routine } = await setUp()
    const started = await taskIn(project.id, { routineId: routine.id, roundAt: new Date('2026-10-05T12:00:00Z'), runState: 'RUN_ACTIVE' })
    await pauseRoutine(routine.id, NOW)
    expect(await routineRow(routine.id)).toMatchObject({ enabled: false, nextRoundAt: null })
    expect(await roundsOf(routine.id)).toEqual([expect.objectContaining({ id: started.id, roundAt: null, runState: 'RUN_ACTIVE' })])
  })

  it('deleting removes the waiting round and then the routine; earlier rounds stay, unlinked', async () => {
    const { project, routine } = await setUp()
    const earlier = await taskIn(project.id, { routineId: routine.id, roundAt: new Date('2026-10-04T09:00:00Z') })
    await deleteRoutine(routine.id, NOW)
    expect(await routineRow(routine.id)).toBeNull()
    expect(await prisma.task.findMany({ select: { id: true, routineId: true } })).toEqual([{ id: earlier.id, routineId: null }])
  })

  it('turning it back on creates a fresh round for its next time', async () => {
    const { routine } = await setUp()
    await pauseRoutine(routine.id, NOW)
    await resumeRoutine(routine.id, NOW)
    expect(await routineRow(routine.id)).toMatchObject({ enabled: true, nextRoundAt: NEXT })
    expect((await roundsOf(routine.id)).map(t => t.roundAt)).toEqual([NEXT])
  })

  it('turning on a routine that is already on, or an unknown one, changes nothing / refuses', async () => {
    const { routine } = await setUp()
    await resumeRoutine(routine.id, NOW)
    expect(await roundsOf(routine.id)).toHaveLength(1)
    await expect(resumeRoutine('no-such-routine', NOW)).rejects.toThrow(/not found/)
  })

  it('a routine paused because its person lost access is not turned back on, except by a project admin taking it over', async () => {
    const { routine } = await setUp()
    await prisma.routine.update({ where: { id: routine.id }, data: { enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON } })
    await expect(resumeRoutine(routine.id, NOW)).rejects.toThrow(/project admin takes it over/)
    expect((await routineRow(routine.id))!.enabled).toBe(false)
  })

  it('taking it over turns it back on and releases its blocked waiting round to the new person', async () => {
    const { routine } = await setUp()
    await prisma.routine.update({ where: { id: routine.id }, data: { enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON } })
    await prisma.task.updateMany({ where: { routineId: routine.id }, data: { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON } })
    await updateRoutine(routine.id, { onBehalfOfUserId: 'erin' }, NOW)
    expect(await routineRow(routine.id)).toMatchObject({ onBehalfOfUserId: 'erin', enabled: true, pausedReason: null })
    expect(await roundsOf(routine.id)).toEqual([
      expect.objectContaining({ runState: 'RUN_NONE', runStateReason: null, onBehalfOfUserId: 'erin' }),
    ])
  })
})

describe('a round unlinked or deleted', () => {
  it('the waiting round unlinked becomes a plain scheduled task, and the routine creates the round for the time after', async () => {
    const { routine } = await setUp()
    const [waiting] = await roundsOf(routine.id)
    await unlinkRound(waiting.id, NOW)
    expect(await prisma.task.findUnique({ where: { id: waiting.id } })).toMatchObject({
      routineId: null, roundAt: null, scheduleAt: NEXT, scheduleNextDueAt: NEXT, scheduleSetByUserId: 'dana',
    })
    expect((await roundsOf(routine.id)).map(t => t.roundAt)).toEqual([AFTER])
    expect((await routineRow(routine.id))!.nextRoundAt).toEqual(AFTER)
  })

  it('an earlier round unlinked is only no longer linked', async () => {
    const { project, routine } = await setUp()
    const earlier = await taskIn(project.id, { routineId: routine.id, roundAt: new Date('2026-10-04T09:00:00Z'), onBehalfOfUserId: 'dana' })
    await unlinkRound(earlier.id, NOW)
    expect(await prisma.task.findUnique({ where: { id: earlier.id } })).toMatchObject({ routineId: null, scheduleAt: null })
    expect(await roundsOf(routine.id)).toHaveLength(1)
  })

  it('a task that is no round is left alone', async () => {
    const { project } = await createProjectWithUsers()
    const task = await taskIn(project.id)
    await unlinkRound(task.id, NOW)
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ routineId: null })
  })

  it('the waiting round deleted skips that one time: the round after it is created', async () => {
    const { routine } = await setUp()
    const [waiting] = await roundsOf(routine.id)
    await prisma.task.delete({ where: { id: waiting.id } })
    await roundDeleted({ routineId: routine.id, roundAt: NEXT }, NOW)
    expect((await roundsOf(routine.id)).map(t => t.roundAt)).toEqual([AFTER])
    expect((await routineRow(routine.id))!.nextRoundAt).toEqual(AFTER)
  })

  it.each([
    ['a round whose time has passed', { roundAt: new Date('2026-10-04T09:00:00Z') }],
    ['a task that is no round', { routineId: null, roundAt: null }],
    ['a round that is not the one the routine waits on', { roundAt: new Date('2026-10-07T09:00:00Z') }],
  ])('deleting %s changes nothing', async (_what, patch) => {
    const { routine } = await setUp()
    await roundDeleted({ routineId: routine.id, ...patch }, NOW)
    expect((await roundsOf(routine.id)).map(t => t.roundAt)).toEqual([NEXT])
    expect((await routineRow(routine.id))!.nextRoundAt).toEqual(NEXT)
  })
})

describe('who may change a routine, and losing access', () => {
  it('its person, or an admin of its project — no one else', async () => {
    const { project, users } = await createProjectWithUsers()
    await addMember(project.id, users.admin.id, 'ADMIN')
    await addMember(project.id, users.member.id)
    const routine = { projectId: project.id, onBehalfOfUserId: users.person.id }
    expect(await mayManageRoutine(routine, users.person.id)).toBe(true)
    expect(await mayManageRoutine(routine, users.admin.id)).toBe(true)
    expect(await mayManageRoutine(routine, users.member.id)).toBe(false)
  })

  it('pauses the routines of a person who lost access, with why — their waiting rounds stay', async () => {
    const { routine } = await setUp()
    const paused = await routineIn((await createProjectWithUsers()).project.id, 'dana', { enabled: false })
    expect(await pauseRoutinesForLostAccess({ onBehalfOfUserId: 'dana' })).toBe(1)
    expect(await routineRow(routine.id)).toMatchObject({ enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON })
    expect((await routineRow(paused.id))!.pausedReason).toBeNull()
    expect(await roundsOf(routine.id)).toHaveLength(1)
  })
})

describe('round times fall on the minute', () => {
  const EVERY_5 = { kind: 'interval', every: 5, unit: 'minutes' } as const
  const SAVED = new Date('2026-10-05T13:47:35.348Z')

  it('a routine set up with no start time comes an interval after the next whole minute', async () => {
    const { project } = await createProjectWithUsers()
    const routine = await createRoutine(project.id, TEMPLATE, { rule: EVERY_5 }, person('dana'), SAVED)
    const expected = new Date('2026-10-05T13:53:00.000Z')
    expect(await routineRow(routine.id)).toMatchObject({ scheduleAt: new Date('2026-10-05T13:48:00.000Z'), nextRoundAt: expected })
    expect((await roundsOf(routine.id))[0].roundAt).toEqual(expected)
  })

  it('a start time with seconds is rounded up to its minute', async () => {
    const { project } = await createProjectWithUsers()
    const routine = await createRoutine(project.id, TEMPLATE, { rule: EVERY_5, at: '2026-10-05T14:00:20Z' }, person('dana'), SAVED)
    expect(await routineRow(routine.id)).toMatchObject({
      scheduleAt: new Date('2026-10-05T14:01:00Z'), nextRoundAt: new Date('2026-10-05T14:01:00Z'),
    })
  })

  it('changing the schedule with no start time moves the waiting round to a whole minute', async () => {
    const { project } = await createProjectWithUsers()
    const routine = await createRoutine(project.id, TEMPLATE, { rule: DAILY, at: NINE, timezone: 'UTC' }, person('dana'), SAVED)
    await updateRoutine(routine.id, { schedule: { rule: EVERY_5 } }, SAVED)
    expect((await roundsOf(routine.id)).map(t => t.roundAt)).toEqual([new Date('2026-10-05T13:53:00Z')])
  })
})
