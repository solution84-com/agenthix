/**
 * `create_routine` and `update_routine` (spec §3) against the real test
 * database: an agent sets up or changes a routine only when a person asked —
 * under the same gate as a start time — on behalf of that person, recording
 * itself and its session, with times read on that person's clock.
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

const DAILY = { kind: 'interval', every: 1, unit: 'days' } as const
let w: AutomationWorld
let dana: string
const args = () => ({ projectId: w.projectId, title: 'Board review', rule: DAILY, timezone: 'Europe/London' })
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
})

describe('create_routine', () => {
  it.each(['pulse', 'schedule', 'agent'] as const)('is refused in a run the %s started — unattended work never schedules work', async (startedBy) => {
    await expectCode(createRoutineOp(chat({ startedBy }), args()), 'forbidden', /only available when a person asked/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it('is refused where the project does not let agents set schedules', async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    await expectCode(createRoutineOp(chat(), args()), 'forbidden', /does not let agents set schedules/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it("in a person's chat, sets it up on behalf of that person, recording the agent and its session", async () => {
    const res = await createRoutineOp(chat(), { ...args(), priority: 'high', boardId: w.boardId, column: 'ready' })
    expect(res).toMatchObject({ routineId: expect.any(String), timezone: 'Europe/London' })
    expect(await routine((res as { routineId: string }).routineId)).toMatchObject({
      title: 'Board review', priority: 'HIGH', boardId: w.boardId, column: 'ready', assignedAgentId: null,
      scheduleTimezone: 'Europe/London', onBehalfOfUserId: dana, createdByUserId: dana, createdByAgentId: 'agent-1', createdBySessionId: 'chat-1',
    })
  })

  it("through a person's connection, sets it up as that person, recording the connection", async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    const res = await createRoutineOp(connectionCaller({ userId: dana, connectionId: 'conn-9' }), args()) as { routineId: string }
    expect(await routine(res.routineId)).toMatchObject({ onBehalfOfUserId: dana, createdByUserId: dana, createdByAgentId: null, createdByConnectionId: 'conn-9' })
  })

  it('a routine the schedule refuses comes back as invalid, saying why', async () => {
    await expectCode(createRoutineOp(chat(), { ...args(), rule: { kind: 'interval', every: 1, unit: 'minutes' } }), 'invalid', /5 minutes/)
    expect(await prisma.routine.count()).toBe(0)
  })
})

describe('update_routine', () => {
  let routineId: string
  beforeEach(async () => {
    routineId = ((await createRoutineOp(chat(), args())) as { routineId: string }).routineId
  })

  it("is refused for a routine the run's person may not change", async () => {
    const erin = (await prisma.user.create({ data: {} })).id
    await prisma.routine.update({ where: { id: routineId }, data: { onBehalfOfUserId: erin } })
    await expectCode(updateRoutineOp(chat(), { routineId, enabled: false }), 'forbidden', /Only the person this routine/)
    expect((await routine(routineId)).enabled).toBe(true)
  })

  it('is refused in a run no person started', async () => {
    await expectCode(updateRoutineOp(chat({ startedBy: 'pulse' }), { routineId, enabled: false }), 'forbidden')
  })

  it("pauses, turns on, and edits for the routine's own person", async () => {
    await updateRoutineOp(chat(), { routineId, enabled: false })
    expect(await routine(routineId)).toMatchObject({ enabled: false, nextRoundAt: null })
    await updateRoutineOp(chat(), { routineId, enabled: true })
    expect(await routine(routineId)).toMatchObject({ enabled: true, nextRoundAt: expect.any(Date) })
    await updateRoutineOp(chat(), { routineId, title: 'Triage', rule: DAILY })
    expect(await routine(routineId)).toMatchObject({ title: 'Triage', scheduleTimezone: 'Europe/London' })
  })
})

describe("a routine's times are read in its person's timezone", () => {
  /** 2026-10-05 09:00 in Sydney is 2026-10-04 22:00 UTC (daylight time). */
  const NINE_SYDNEY = new Date('2026-10-04T22:00:00.000Z')
  const noZone = () => { const { timezone: _omit, ...rest } = args(); return rest }

  beforeEach(async () => {
    // Only the clock the schedule reads; the database driver keeps real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T03:00:00Z'))
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: 'Australia/Sydney' } })
  })
  afterEach(() => vi.useRealTimers())

  it("create_routine with no timezone reads the schedule in the run's person's", async () => {
    await prisma.userSettings.create({ data: { userId: w.routingAdmin, timezone: 'Asia/Tokyo' } })
    const res = await createRoutineOp(chat(), { ...noZone(), at: '2026-10-05T09:00' }) as { routineId: string }
    expect(res).toMatchObject({ timezone: 'Australia/Sydney' })
    expect(res).not.toHaveProperty('note')
    expect(await routine(res.routineId)).toMatchObject({ scheduleAt: NINE_SYDNEY, scheduleTimezone: 'Australia/Sydney' })
  })

  it('an explicit timezone still wins', async () => {
    const res = await createRoutineOp(chat(), { ...args(), at: '2026-10-05T09:00' }) as { routineId: string }
    expect(await routine(res.routineId)).toMatchObject({ scheduleAt: new Date('2026-10-05T08:00:00.000Z'), scheduleTimezone: 'Europe/London' })
  })

  it('falls back to UTC for a person with none, and says so', async () => {
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: null } })
    const res = await createRoutineOp(chat(), noZone()) as { routineId: string }
    expect(res).toMatchObject({ timezone: 'UTC', note: expect.stringMatching(/no timezone on record/) })
    expect((await routine(res.routineId)).scheduleTimezone).toBe('UTC')
  })

  it("through a person's connection, it is that person's timezone", async () => {
    const res = await createRoutineOp(connectionCaller({ userId: dana, connectionId: 'conn-9' }), noZone()) as { routineId: string }
    expect((await routine(res.routineId)).scheduleTimezone).toBe('Australia/Sydney')
  })

  it('refuses a timezone that is not one', async () => {
    await expectCode(createRoutineOp(chat(), { ...args(), timezone: 'Mars/Olympus' }), 'invalid', /not a timezone/)
    expect(await prisma.routine.count()).toBe(0)
  })

  it("update_routine reads a changed schedule in the person's timezone", async () => {
    const { routineId } = await createRoutineOp(chat(), args()) as { routineId: string }
    await updateRoutineOp(chat(), { routineId, rule: DAILY, at: '2026-10-05T09:00' })
    expect(await routine(routineId)).toMatchObject({ scheduleAt: NINE_SYDNEY, scheduleTimezone: 'Australia/Sydney' })
  })

  it("update_routine keeps the routine's own zone when the person has none", async () => {
    const { routineId } = await createRoutineOp(chat(), args()) as { routineId: string }
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: null } })
    await updateRoutineOp(chat(), { routineId, rule: DAILY })
    expect((await routine(routineId)).scheduleTimezone).toBe('Europe/London')
  })
})

describe('the tools agents see', () => {
  it("their descriptions say times are read in the person's timezone unless one is named", () => {
    for (const name of ['set_task_schedule', 'create_routine', 'update_routine']) {
      const tool = CONTROL_PLANE_TOOLS.find((t) => t.name === name)!
      expect(tool.description, name).toMatch(/timezone of the person you are working for/)
    }
  })

  it('create_routine and update_routine are served, under the start-work group', () => {
    expect(CONTROL_PLANE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(['create_routine', 'update_routine']))
    expect(TOOL_GROUPS.create_routine).toBe('start_work')
    expect(TOOL_GROUPS.update_routine).toBe('start_work')
  })
})
