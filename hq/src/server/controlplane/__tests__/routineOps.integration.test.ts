/**
 * `create_routine` and `update_routine` (adr-0177) against the real test
 * database: an agent makes or changes a routine only when a person asked —
 * under the same gate as a start time — on behalf of that person, recording
 * itself and its session, with its cron rule read on that person's clock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { createRoutineOp, updateRoutineOp } from '../routineOps'
import { CONTROL_PLANE_TOOLS } from '../toolSchemas'
import { TOOL_GROUPS } from '../connectionGroups'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { seedAutomation, taskRun, projectAutomation, type AutomationWorld } from './automationFixtures'

const WEEKDAYS = '0 9 * * 1-5'
let w: AutomationWorld
let dana: string
const args = () => ({ projectId: w.projectId, title: 'Board review', agentId: 'agent-1', instructions: 'Review the board', cron: WEEKDAYS, timezone: 'Europe/London' })
/** dana's own chat, in which she asks her agent. */
const chat = (over: Parameters<typeof taskRun>[1] = {}) => taskRun(w, { userId: dana, taskId: null, sessionId: 'chat-1', ...over })
const routine = (id: string) => prisma.routine.findUniqueOrThrow({ where: { id } })

async function expectCode(p: Promise<unknown>, code: string, message?: RegExp) {
  const err = await p.then(() => null, (e) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  expect(err.code).toBe(code)
  if (message) expect(err.message).toMatch(message)
}

beforeEach(async () => {
  w = await seedAutomation()
  await prisma.org.create({ data: { name: 'Org', automationAgentSchedules: true } })
  await projectAutomation(w.projectId, { agentSchedules: true })
  dana = (await prisma.user.create({ data: {} })).id
  // A run is held to its person's role in the project (adr-0101, adr-0102); scheduling changes it.
  await prisma.userSettings.create({ data: { userId: dana, role: 'MEMBER' } })
  await prisma.projectMember.create({ data: { projectId: w.projectId, userId: dana } })
  await prisma.agentSession.create({ data: { id: 'chat-1', userId: dana, agentId: 'agent-1', sessionType: 'chat' } })
  // A routine's agent is one assigned to its project.
  await prisma.projectAgent.create({ data: { projectId: w.projectId, agentId: 'agent-1' } })
})

describe('create_routine', () => {
  it.each(['pulse', 'schedule', 'agent'] as const)("is refused in a run the %s started — unattended work, a routine's own run included, never schedules work", async (startedBy) => {
    await expectCode(createRoutineOp(chat({ startedBy }), args()), 'forbidden', /only available when a person asked/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('is refused where the project does not let agents set schedules', async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    await expectCode(createRoutineOp(chat(), args()), 'forbidden', /does not let agents set schedules/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it("in a person's chat, makes it on behalf of that person, recording the agent and its session", async () => {
    const res = await createRoutineOp(chat(), args())
    expect(res).toMatchObject({ routineId: expect.any(String), timezone: 'Europe/London', nextRunAt: expect.any(String) })
    expect(await routine((res as { routineId: string }).routineId)).toMatchObject({
      title: 'Board review', agentId: 'agent-1', instructions: 'Review the board', cron: WEEKDAYS, timezone: 'Europe/London',
      enabled: true, nextDueAt: expect.any(Date),
      onBehalfOfUserId: dana, createdByUserId: dana, createdByAgentId: 'agent-1', createdBySessionId: 'chat-1',
    })
  })

  it("through a person's connection, makes it as that person, recording the connection", async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    const res = await createRoutineOp(connectionCaller({ userId: dana, connectionId: 'conn-9' }), args()) as { routineId: string }
    expect(await routine(res.routineId)).toMatchObject({ onBehalfOfUserId: dana, createdByUserId: dana, createdByAgentId: null, createdByConnectionId: 'conn-9' })
  })

  it('a schedule more often than every 5 minutes comes back as invalid, saying why', async () => {
    await expectCode(createRoutineOp(chat(), { ...args(), cron: '*/2 * * * *' }), 'invalid', /at most every 5 minutes/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('an agent not assigned to the project is refused', async () => {
    await expectCode(createRoutineOp(chat(), { ...args(), agentId: 'agent-2' }), 'invalid', /not assigned to this project/)
  })
})

describe('update_routine', () => {
  let routineId: string
  beforeEach(async () => {
    routineId = ((await createRoutineOp(chat(), args())) as { routineId: string }).routineId
  })

  it("changes anyone's routine the run's person may work beside, and it then runs on that person's behalf (N6)", async () => {
    const erin = (await prisma.user.create({ data: {} })).id
    await prisma.routine.update({ where: { id: routineId }, data: { onBehalfOfUserId: erin } })
    await updateRoutineOp(chat(), { routineId, instructions: 'Review it twice' })
    expect(await routine(routineId)).toMatchObject({ instructions: 'Review it twice', onBehalfOfUserId: dana })
  })

  it('is refused in a run no person started', async () => {
    await expectCode(updateRoutineOp(chat({ startedBy: 'schedule' }), { routineId, enabled: false }), 'forbidden')
  })

  it("is refused in a run of a routine, even one a person started with Run now, and so is create_routine", async () => {
    await prisma.agentSession.create({ data: { id: 'routine-run-1', userId: dana, agentId: 'agent-1', sessionType: 'chat' } })
    await prisma.routineRun.create({ data: { routineId, number: 1, onBehalfOfUserId: dana, startedByUserId: dana, agentId: 'agent-1', state: 'RUNNING', sessionId: 'routine-run-1' } })
    const inRoutineRun = chat({ sessionId: 'routine-run-1', startedBy: 'person' })
    await expectCode(updateRoutineOp(inRoutineRun, { routineId, enabled: false }), 'forbidden', /a routine's run cannot make or change routines.*Nothing was changed/)
    await expectCode(createRoutineOp(inRoutineRun, args()), 'forbidden', /a routine's run cannot make or change routines/)
    expect(await routine(routineId)).toMatchObject({ enabled: true })
    expect(await prisma.routine.count()).toBe(1)
  })

  it('switches it off and on, and changes its schedule', async () => {
    await updateRoutineOp(chat(), { routineId, enabled: false })
    expect(await routine(routineId)).toMatchObject({ enabled: false, nextDueAt: null })
    await updateRoutineOp(chat(), { routineId, enabled: true })
    expect(await routine(routineId)).toMatchObject({ enabled: true, nextDueAt: expect.any(Date) })
    await updateRoutineOp(chat(), { routineId, title: 'Triage', cron: '30 8 * * *' })
    expect(await routine(routineId)).toMatchObject({ title: 'Triage', cron: '30 8 * * *', timezone: 'Europe/London' })
  })
})

describe("a routine's cron rule is read in its person's timezone", () => {
  const noZone = () => { const { timezone: _omit, ...rest } = args(); return rest }

  beforeEach(async () => {
    // Only the clock the schedule reads; the database driver keeps real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T03:00:00Z'))
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: 'Australia/Sydney' } })
  })
  afterEach(() => vi.useRealTimers())

  it("create_routine with no timezone reads it in the run's person's", async () => {
    await prisma.userSettings.create({ data: { userId: w.routingAdmin, timezone: 'Asia/Tokyo' } })
    const res = await createRoutineOp(chat(), noZone()) as { routineId: string }
    expect(res).toMatchObject({ timezone: 'Australia/Sydney' })
    expect(res).not.toHaveProperty('note')
    // Monday 5 October 09:00 in Sydney is 22:00 UTC the day before (daylight time).
    expect(await routine(res.routineId)).toMatchObject({ timezone: 'Australia/Sydney', nextDueAt: new Date('2026-10-04T22:00:00.000Z') })
  })

  it('falls back to UTC for a person with none, and says so', async () => {
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: null } })
    const res = await createRoutineOp(chat(), noZone()) as { routineId: string }
    expect(res).toMatchObject({ timezone: 'UTC', note: expect.stringMatching(/no timezone on record/) })
    expect((await routine(res.routineId)).timezone).toBe('UTC')
  })

  it("through a person's connection, it is that person's timezone", async () => {
    const res = await createRoutineOp(connectionCaller({ userId: dana, connectionId: 'conn-9' }), noZone()) as { routineId: string }
    expect((await routine(res.routineId)).timezone).toBe('Australia/Sydney')
  })

  it('refuses a timezone that is not one', async () => {
    await expectCode(createRoutineOp(chat(), { ...args(), timezone: 'Mars/Olympus' }), 'invalid', /not a timezone/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it("update_routine reads a new cron rule in the person's timezone, and keeps the routine's own when they have none", async () => {
    const { routineId } = await createRoutineOp(chat(), args()) as { routineId: string }
    await updateRoutineOp(chat(), { routineId, cron: WEEKDAYS })
    expect((await routine(routineId)).timezone).toBe('Australia/Sydney')
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: null } })
    await updateRoutineOp(chat(), { routineId, cron: '0 10 * * *' })
    expect((await routine(routineId)).timezone).toBe('Australia/Sydney')
  })
})

describe('the tools agents see', () => {
  it("their words say times are read in the person's timezone unless one is named", () => {
    expect(CONTROL_PLANE_TOOLS.find((t) => t.name === 'set_task_schedule')!.description).toMatch(/timezone of the person you are working for/)
    const describedAs = (tool: string, arg: string) => (CONTROL_PLANE_TOOLS.find((t) => t.name === tool)!.schema[arg] as { description?: string }).description
    const createZone = describedAs('create_routine', 'timezone')
    expect(createZone).toMatch(/Omit it for the timezone of the person you work for/)
    const updateCron = describedAs('update_routine', 'cron')
    expect(updateCron).toMatch(/else the person's you work for, else the routine's own/)
  })

  it('create_routine and update_routine are served, under the start-work group', () => {
    expect(CONTROL_PLANE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(['create_routine', 'update_routine']))
    expect(TOOL_GROUPS.create_routine).toBe('start_work')
    expect(TOOL_GROUPS.update_routine).toBe('start_work')
  })
})
