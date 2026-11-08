/**
 * set_task_schedule over the control plane (spec §3, adr-0087, adr-0089),
 * against the real test database: an agent sets a start time only when a person
 * asked and the project lets agents schedule; it is set on behalf of the
 * person behind the run, who must be the task's own person or a project admin;
 * and an offset-less time is read on that person's clock.
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

import { setTaskScheduleOp } from '../scheduleOps'
import { CONTROL_PLANE_TOOLS } from '../toolSchemas'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { expectForbidden } from './controlPlaneFixtures'
import { seedAutomation, taskRun, projectAutomation, type AutomationWorld } from './automationFixtures'

let w: AutomationWorld
let dana: string
const t1 = () => prisma.task.findUniqueOrThrow({ where: { id: 't1' } })
const inAnHour = () => new Date(Math.ceil((Date.now() + 3_600_000) / 60_000) * 60_000).toISOString()
/** A chat by dana, a project admin, asking her agent to schedule. */
const danasChat = () => taskRun(w, { userId: dana, taskId: null, sessionId: 'chat-1' })

beforeEach(async () => {
  w = await seedAutomation()
  await prisma.org.create({ data: { name: 'Org', automationAgentSchedules: true } })
  await projectAutomation(w.projectId, { agentSchedules: true })
  await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE' } })
  dana = (await prisma.user.create({ data: {} })).id
  // A run is held to its person's role in the project (adr-0101, adr-0102); scheduling changes it.
  await prisma.userSettings.create({ data: { userId: dana, role: 'MEMBER' } })
  await prisma.projectMember.create({ data: { projectId: w.projectId, userId: dana, role: 'ADMIN' } })
  await prisma.agentSession.create({ data: { id: 'chat-1', userId: dana, agentId: 'agent-1', sessionType: 'chat' } })
})

describe('set_task_schedule — an agent only when a person asked (spec §3)', () => {
  it.each(['pulse', 'schedule'] as const)('is refused in a run the %s started', async (startedBy) => {
    const err = await expectForbidden(setTaskScheduleOp(taskRun(w, { startedBy }), { taskId: 't1', at: inAnHour() }))
    expect(err.message).toMatch(/only available when a person asked/)
    expect((await t1()).scheduleAt).toBeNull()
  })

  it('is refused where the project does not let agents set schedules', async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    const err = await expectForbidden(setTaskScheduleOp(taskRun(w), { taskId: 't1', at: inAnHour() }))
    expect(err.message).toMatch(/does not let agents set schedules/)
    expect((await t1()).scheduleAt).toBeNull()
  })

  it("in a person's chat, sets it on behalf of that person and records the agent and session", async () => {
    const at = inAnHour()
    expect(await setTaskScheduleOp(danasChat(), { taskId: 't1', at })).toMatchObject({ scheduled: true })
    expect(await t1()).toMatchObject({
      onBehalfOfUserId: dana, scheduleSetByUserId: dana, scheduleSetByAgentId: 'agent-1', scheduleSetBySessionId: 'chat-1',
      scheduleNextDueAt: new Date(at),
    })
  })

  it("through a person's connection, sets it as that person and records the connection — the agents switch does not apply", async () => {
    await projectAutomation(w.projectId, { agentSchedules: false })
    await setTaskScheduleOp(connectionCaller({ userId: w.u1, connectionId: 'conn-9' }), { taskId: 't1', at: inAnHour() })
    expect(await t1()).toMatchObject({
      onBehalfOfUserId: w.u1, scheduleSetByUserId: w.u1, scheduleSetByAgentId: null, scheduleSetBySessionId: null, scheduleSetByConnectionId: 'conn-9',
    })
  })

  it('refuses a start time in the past with a clear error', async () => {
    const err = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: new Date(Date.now() - 60_000).toISOString() }).catch((e) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err).toMatchObject({ code: 'invalid', message: expect.stringMatching(/in the future/) })
  })

  it('takes no repeat: the rule is not part of the tool any more (adr-0092)', () => {
    const tool = CONTROL_PLANE_TOOLS.find((t) => t.name === 'set_task_schedule')!
    expect(Object.keys(tool.schema)).toEqual(['taskId', 'at', 'timezone', 'clear'])
  })

  it('refuses a start time on an epic, which is never run, setting nothing', async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { isEpic: true } })
    const err = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: inAnHour() }).catch((e) => e)
    expect(err).toMatchObject({ code: 'invalid', message: expect.stringMatching(/An epic is never run/) })
    expect((await t1()).scheduleNextDueAt).toBeNull()
  })

  it('clears a schedule', async () => {
    await setTaskScheduleOp(danasChat(), { taskId: 't1', at: inAnHour() })
    expect(await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '', clear: true } as never)).toEqual({ taskId: 't1', scheduled: false })
    expect((await t1()).scheduleNextDueAt).toBeNull()
  })
})

describe('set_task_schedule — on behalf of the person behind the run (adr-0089)', () => {
  it("in a task run a person started, the task's person — not the session's routing identity", async () => {
    await setTaskScheduleOp(taskRun(w), { taskId: 't1', at: inAnHour() })
    expect(await t1()).toMatchObject({ onBehalfOfUserId: w.u1, scheduleSetByUserId: w.u1 })
  })

  it("is refused on a task done on someone else's behalf when the run's person is not a project admin", async () => {
    const frank = (await prisma.user.create({ data: {} })).id
    await prisma.task.update({ where: { id: 't1' }, data: { onBehalfOfUserId: frank } })
    const err = await expectForbidden(setTaskScheduleOp(taskRun(w), { taskId: 't1', at: inAnHour() }))
    expect(err.message).toMatch(/Only the person this task is done on behalf of/)
    expect((await t1()).scheduleAt).toBeNull()
  })

  it("a project admin may schedule a task done on someone else's behalf", async () => {
    await setTaskScheduleOp(danasChat(), { taskId: 't1', at: inAnHour() })
    expect((await t1()).scheduleAt).not.toBeNull()
  })

  it('is refused when that person can no longer reach the project', async () => {
    await prisma.task.update({ where: { id: 't0' }, data: { onBehalfOfUserId: 'gone' } })
    const err = await expectForbidden(setTaskScheduleOp(taskRun(w), { taskId: 't1', at: inAnHour() }))
    expect(err.message).toMatch(/no longer in the organisation/)
    expect((await t1()).scheduleAt).toBeNull()
  })
})

describe("set_task_schedule reads a time on its person's clock", () => {
  /** 2026-10-05 09:00 in Sydney (UTC+11 in daylight time) is 2026-10-04 22:00 UTC. */
  const NINE_SYDNEY = '2026-10-04T22:00:00.000Z'
  beforeEach(async () => {
    // Only the clock the schedule reads; the database driver keeps real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T03:00:00Z'))
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: 'Australia/Sydney' } })
  })
  afterEach(() => vi.useRealTimers())
  const startsAt = async () => (await t1()).scheduleNextDueAt?.toISOString()

  it("an offset-less time is the person's own wall-clock time, looked up for the run's person", async () => {
    await prisma.userSettings.create({ data: { userId: w.routingAdmin, timezone: 'Asia/Tokyo' } })
    const res = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '2026-10-05T09:00' })
    expect(await startsAt()).toBe(NINE_SYDNEY)
    expect(res).toMatchObject({ scheduled: true, startsAt: NINE_SYDNEY, timezone: 'Australia/Sydney' })
    expect(res).not.toHaveProperty('note')
  })

  it('a time that carries its own offset is left alone', async () => {
    await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '2026-10-05T09:00:00+01:00' })
    expect(await startsAt()).toBe('2026-10-05T08:00:00.000Z')
  })

  it("an explicit timezone wins over the person's", async () => {
    const res = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '2026-10-05T09:00', timezone: 'Europe/London' })
    expect(await startsAt()).toBe('2026-10-05T08:00:00.000Z')
    expect(res).toMatchObject({ timezone: 'Europe/London' })
  })

  it('falls back to UTC for a person with none, and says so in the result', async () => {
    await prisma.userSettings.update({ where: { userId: dana }, data: { timezone: null } })
    const res = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '2026-10-05T09:00' })
    expect(await startsAt()).toBe('2026-10-05T09:00:00.000Z')
    expect(res).toMatchObject({ timezone: 'UTC', note: expect.stringMatching(/no timezone on record.*UTC/) })
  })

  it("a person's own connection uses that person's timezone the same way", async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { onBehalfOfUserId: dana } })
    await setTaskScheduleOp(connectionCaller({ userId: dana, connectionId: 'conn-9' }), { taskId: 't1', at: '2026-10-05T09:00' })
    expect(await startsAt()).toBe(NINE_SYDNEY)
  })

  it('refuses a timezone that is not one, setting nothing', async () => {
    const err = await setTaskScheduleOp(danasChat(), { taskId: 't1', at: '2026-10-05T09:00', timezone: 'Mars/Olympus' }).catch((e) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('invalid')
    expect((await t1()).scheduleAt).toBeNull()
  })
})
