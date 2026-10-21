/**
 * Scheduled tasks against Postgres (spec §3, adr-0091, adr-0092): a start time is a Run a person asked for later. It
 * does not wait for the pulse; it starts the task once, as the schedule, unless something real delays it, and with the
 * boundary's automation off it is queued instead. TaskRunner is the shared fake: what the scheduler asks it to start
 * is the behaviour, the run itself is not.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { startSchedulesDue, AUTOMATION_OFF_REASON, NO_AGENT_REASON, NEEDS_PERSON_REASON } from '../scheduledStart'
import { ORG_AUTOMATION_DEFAULTS } from '../automationSettings'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { boardOf, taskIn } from './automationWorld'

const NOW = new Date('2026-10-03T09:00:20Z')
const DUE = new Date('2026-10-03T09:00:00Z')
const runner = taskRunnerFake.taskRunner

async function scheduled(automation: Record<string, unknown> | null, patch: Record<string, unknown> = {}, withAgent = true) {
  const project = await createProject()
  const agent = await createAgent()
  const board = await boardOf(project.id)
  if (automation) await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, ...automation } as any })
  const task = await taskIn(project.id, {
    title: 'Board review', boardId: board.id, assignedAgentId: withAgent ? agent.id : null, scheduleAt: DUE, scheduleNextDueAt: DUE,
    onBehalfOfUserId: 'dana', scheduleSetByUserId: 'dana', ...patch,
  })
  return { project, agent, board, task }
}

const taskRow = (id: string) => prisma.task.findUnique({ where: { id } })
const recorded = async (taskId: string) =>
  (await prisma.automationStart.findMany({ where: { taskId, kind: 'SCHEDULE' } })).map(r => (r.started as Array<Record<string, unknown>>)[0])

describe('a scheduled task falling due', () => {
  it('is claimed once, and starts at its time through TaskRunner as the schedule — not waiting for the pulse', async () => {
    const { task, agent } = await scheduled({})
    expect(await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)).toBe(1)
    expect((await taskRow(task.id))!.scheduleNextDueAt).toBeNull()
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'schedule', agent: expect.objectContaining({ id: agent.id }) })])
    expect(await recorded(task.id)).toEqual([expect.objectContaining({ taskId: task.id, agentId: agent.id, outcome: 'started' })])
  })

  it('a claim lost to another tick starts nothing: two ticks start it once', async () => {
    const { task } = await scheduled({})
    await Promise.all([startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW), startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)])
    expect(runner.runTask.mock.calls.filter(c => c[0] === task.id)).toHaveLength(1)
    expect(await recorded(task.id)).toHaveLength(1)
  })

  it('takes everything due within the tick\'s minute, and nothing due later or archived', async () => {
    const early = await scheduled({}, { scheduleNextDueAt: new Date('2026-10-03T09:00:50Z') })
    const later = await scheduled({}, { scheduleNextDueAt: new Date('2026-10-03T09:02:00Z') })
    const archived = await scheduled({}, { archived: true })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(runner.runTask.mock.calls.map(c => c[0])).toEqual([early.task.id])
    expect((await taskRow(later.task.id))!.scheduleNextDueAt).not.toBeNull()
    expect((await taskRow(archived.task.id))!.scheduleNextDueAt).not.toBeNull()
  })

  it('is asked to start, as the schedule, at depth 0 and queued by the person who set it — a person set it (adr-0089, adr-0091)', async () => {
    const { task } = await scheduled({}, { scheduleSetByUserId: 'erin', queueDepth: 3 })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await taskRow(task.id)).toMatchObject({
      runState: 'RUN_QUEUED', runStartedBy: 'schedule', queueDepth: 0, queuedByUserId: 'erin', queuedByAgentId: null,
    })
  })

  it('records that it waits for its agent when the agent is busy in the project', async () => {
    const { task } = await scheduled({})
    runner.runTask.mockResolvedValue({ outcome: 'waiting' })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await recorded(task.id)).toEqual([expect.objectContaining({ outcome: 'waiting' })])
  })

  it('records a start that failed, with its reason', async () => {
    const { task } = await scheduled({})
    runner.runTask.mockResolvedValue({ outcome: 'failed', reason: 'no Execution Site' })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await recorded(task.id)).toEqual([expect.objectContaining({ outcome: 'failed', reason: 'no Execution Site' })])
  })

  it('records nothing when the runner skipped it', async () => {
    const { task } = await scheduled({})
    runner.runTask.mockResolvedValue({ outcome: 'skipped' })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await recorded(task.id)).toEqual([])
  })

  it('tells its board when it asks to start it', async () => {
    const { task, board } = await scheduled({})
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    expect((await taskRow(task.id))!.boardId).toBe(board.id)
  })

  it('already running (a person pressed Run first) — that run is this occurrence', async () => {
    const { task } = await scheduled({}, { runState: 'RUN_ACTIVE', runStartedBy: 'person' })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person', scheduleNextDueAt: null })
  })

  it('a run a person asked for meanwhile is not started over: the task is read, then a person presses Run', async () => {
    const { task } = await scheduled({})
    const realFindMany = prisma.task.findMany.bind(prisma.task)
    const spy = vi.spyOn(prisma.task, 'findMany').mockImplementationOnce(((args: any) =>
      realFindMany(args).then(async rows => {
        await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE', runStartedBy: 'person' } })
        return rows
      })) as never)
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    spy.mockRestore()
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person' })
  })
})

describe('with automation off, the scheduled task is queued instead', () => {
  it('the project\'s automation off: queued with a reason, on behalf of its person, and not started', async () => {
    const { task } = await scheduled(null)
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({
      runState: 'RUN_QUEUED', runStateReason: AUTOMATION_OFF_REASON, runStartedBy: null, queueDepth: 0, queuedByUserId: 'dana', queuedByAgentId: null,
    })
    expect(await recorded(task.id)).toEqual([expect.objectContaining({ outcome: 'queued' })])
  })

  it('the org\'s automation off: queued too', async () => {
    const { task } = await scheduled({})
    await startSchedulesDue({ ...ORG_AUTOMATION_DEFAULTS, allowed: false }, NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect((await taskRow(task.id))!.runState).toBe('RUN_QUEUED')
  })

  it('in a throttled project it waits for the next round as well', async () => {
    const { task } = await scheduled({ enabled: false, throttle: true })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect((await taskRow(task.id))!.runState).toBe('RUN_THROTTLED')
  })

  it('never over a start someone already asked for', async () => {
    const { task } = await scheduled(null, { runState: 'RUN_QUEUED', runStartedBy: 'person' })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'person', runStateReason: null })
  })
})

describe('a scheduled time reached when the task cannot start', () => {
  it.each([
    ['blocked because its person lost access', { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON }],
    ['failed', { runState: 'RUN_FAILED', runStateReason: 'boom' }],
  ])('a task whose last run is %s waits for a person: not queued, and the start recorded as failed with why', async (_what, state) => {
    const { task } = await scheduled({}, state)
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ ...state, scheduleNextDueAt: null })
    expect(await recorded(task.id)).toEqual([expect.objectContaining({ outcome: 'failed', reason: `${NEEDS_PERSON_REASON}: ${state.runStateReason}` })])
  })

  it('with no agent assigned, says so — once: a task starts at most once (adr-0092)', async () => {
    const { task } = await scheduled({}, {}, false)
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_NONE', runStateReason: NO_AGENT_REASON, scheduleNextDueAt: null })
    await startSchedulesDue(ORG_AUTOMATION_DEFAULTS, NOW)
    expect(await recorded(task.id)).toEqual([])
  })
})
