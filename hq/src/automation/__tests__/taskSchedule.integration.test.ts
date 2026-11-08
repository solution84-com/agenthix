/**
 * Setting or clearing a task's start time against Postgres (spec §3, adr-0089, adr-0092): the schedule is stored with
 * who set it, a run queued earlier is held back until the time, and clearing hands the task back to its column's rule.
 * Setting takes a fixed `now`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { setTaskSchedule, clearTaskSchedule, ScheduleError, mayScheduleTask } from '../taskSchedule'
import { setSchedulerWake } from '../schedulerNudge'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { addMember, boardOf, taskIn } from './automationWorld'

const NOW = new Date('2026-10-03T09:00:00Z')
const AT = '2026-10-03T12:00:00Z'
const wake = vi.fn()

beforeEach(() => {
  wake.mockReset()
  setSchedulerWake(wake)
  return () => setSchedulerWake(null)
})

const taskRow = (id: string) => prisma.task.findUnique({ where: { id } })

describe('setTaskSchedule — a start time to come withdraws a run waiting to start', () => {
  it.each(['RUN_QUEUED'])('a %s run is withdrawn, so it starts at its time and not early', async state => {
    const project = await createProject()
    const task = await taskIn(project.id, { runState: state, runStartedBy: 'person' })
    await setTaskSchedule(task.id, { at: AT }, { kind: 'person', userId: 'dana' }, NOW)
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_NONE', runStartedBy: null, scheduleNextDueAt: new Date(AT) })
  })

  it('a run already going keeps going; the time stands for later', async () => {
    const project = await createProject()
    const task = await taskIn(project.id, { runState: 'RUN_ACTIVE' })
    await setTaskSchedule(task.id, { at: AT }, { kind: 'person', userId: 'dana' }, NOW)
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', scheduleAt: new Date(AT) })
  })
})

describe('setTaskSchedule — a start time falls on the minute', () => {
  it('rounds a time with seconds up to its minute', async () => {
    const project = await createProject()
    const task = await taskIn(project.id)
    const stored = await setTaskSchedule(task.id, { at: '2026-10-03T12:00:20Z' }, { kind: 'person', userId: 'dana' }, NOW)
    expect(stored).toEqual({ scheduleAt: new Date('2026-10-03T12:01:00Z'), scheduleNextDueAt: new Date('2026-10-03T12:01:00Z') })
    expect(await taskRow(task.id)).toMatchObject({ scheduleAt: new Date('2026-10-03T12:01:00Z'), scheduleNextDueAt: new Date('2026-10-03T12:01:00Z') })
  })

  it.each([
    ['no time', {}, /time is needed/],
    ['a time that is not a time', { at: 'soon' }, /not a valid time/],
    ['a time that is not in the future', { at: '2026-10-03T08:59:00Z' }, /in the future/],
  ])('refuses %s, storing nothing', async (_what, input, message) => {
    const project = await createProject()
    const task = await taskIn(project.id)
    await expect(setTaskSchedule(task.id, input, { kind: 'person', userId: 'dana' }, NOW)).rejects.toThrow(message)
    expect((await taskRow(task.id))!.scheduleAt).toBeNull()
  })
})

describe('clearTaskSchedule — the column rule applies again', () => {
  async function scheduledIn(column: string) {
    const project = await createProject()
    const board = await boardOf(project.id)
    const agent = await createAgent()
    const task = await taskIn(project.id, {
      boardId: board.id, column, assignedAgentId: agent.id, scheduleAt: new Date(AT), scheduleNextDueAt: new Date(AT),
      scheduleSetByUserId: 'dana', scheduleSetByAgentId: agent.id,
    })
    return { project, board, agent, task }
  }

  it('clears the time and who set it', async () => {
    const { task } = await scheduledIn('todo')
    await clearTaskSchedule(task.id)
    expect(await taskRow(task.id)).toMatchObject({
      scheduleAt: null, scheduleNextDueAt: null, scheduleSetByUserId: null, scheduleSetByAgentId: null, scheduleSetBySessionId: null,
    })
  })

  it('leaves it alone in a plain column, a done column, or off the board', async () => {
    const plain = await scheduledIn('todo')
    const done = await scheduledIn('done')
    const loose = await taskIn(plain.project.id, { scheduleAt: new Date(AT), scheduleNextDueAt: new Date(AT), assignedAgentId: plain.agent.id })
    for (const t of [plain.task, done.task, loose]) await clearTaskSchedule(t.id)
    expect(await Promise.all([plain.task, done.task, loose].map(async t => (await taskRow(t.id))!.runState))).toEqual(['RUN_NONE', 'RUN_NONE', 'RUN_NONE'])
    expect(wake).not.toHaveBeenCalled()
  })

  it('does not queue a task that has no agent', async () => {
    const { task } = await scheduledIn('ready')
    await prisma.task.update({ where: { id: task.id }, data: { assignedAgentId: null } })
    await clearTaskSchedule(task.id)
    expect((await taskRow(task.id))!.runState).toBe('RUN_NONE')
  })
})

describe('setTaskSchedule — the person behind a schedule (adr-0089)', () => {
  it('a person setting it makes the task done on their behalf, through their connection when they used one', async () => {
    const project = await createProject()
    const task = await taskIn(project.id)
    await setTaskSchedule(task.id, { at: AT }, { kind: 'person', userId: 'dana', connectionId: 'conn-1' }, NOW)
    expect(await taskRow(task.id)).toMatchObject({
      onBehalfOfUserId: 'dana', scheduleSetByUserId: 'dana', scheduleSetByAgentId: null, scheduleSetBySessionId: null, scheduleSetByConnectionId: 'conn-1',
    })
  })

  it('an agent setting it makes the task done on behalf of the person its run is for, and records the agent', async () => {
    const project = await createProject()
    const task = await taskIn(project.id)
    await setTaskSchedule(task.id, { at: AT }, { kind: 'agent', agentId: 'a1', sessionId: 's1', userId: 'erin' }, NOW)
    expect(await taskRow(task.id)).toMatchObject({
      onBehalfOfUserId: 'erin', scheduleSetByUserId: 'erin', scheduleSetByAgentId: 'a1', scheduleSetBySessionId: 's1', scheduleSetByConnectionId: null,
    })
  })

  it('refuses a task blocked because its person lost access — only a project admin releases that', async () => {
    const project = await createProject()
    const task = await taskIn(project.id, { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    await expect(setTaskSchedule(task.id, { at: AT }, { kind: 'person', userId: 'dana' }, NOW)).rejects.toBeInstanceOf(ScheduleError)
    expect(await taskRow(task.id)).toMatchObject({ scheduleAt: null, onBehalfOfUserId: 'nobody' })
  })
})

describe('mayScheduleTask — who answers for a task decides its schedule (adr-0089)', () => {
  it('the person the task is done on behalf of may', async () => {
    const project = await createProject()
    const task = await taskIn(project.id, { onBehalfOfUserId: 'dana' })
    expect(await mayScheduleTask(task.id, 'dana')).toBe(true)
  })

  it('a project admin may; another member may not, so a schedule cannot move the task to them', async () => {
    const project = await createProject()
    const task = await taskIn(project.id, { onBehalfOfUserId: 'dana' })
    const [admin, member] = await Promise.all([prisma.user.create({ data: {} }), prisma.user.create({ data: {} })])
    await addMember(project.id, admin.id, 'ADMIN')
    await addMember(project.id, member.id)
    expect(await mayScheduleTask(task.id, admin.id)).toBe(true)
    expect(await mayScheduleTask(task.id, member.id)).toBe(false)
  })

  it('nobody may on a task that does not exist', async () => {
    expect(await mayScheduleTask('no-such-task', 'dana')).toBe(false)
  })
})
