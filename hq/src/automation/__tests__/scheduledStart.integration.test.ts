/**
 * Scheduled tasks against Postgres (spec D6, adr-0175, adr-0091, adr-0092): a start time is a Run a person asked for
 * later. It starts the task once, as the schedule, unless something real delays it; there is no switch that holds it
 * back. TaskRunner is the shared fake: what the scheduler asks it to start is the behaviour, the run itself is not.
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

import { startSchedulesDue, NO_AGENT_REASON } from '../scheduledStart'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { boardOf, taskIn } from './automationWorld'

const NOW = new Date('2026-10-03T09:00:20Z')
const DUE = new Date('2026-10-03T09:00:00Z')
const runner = taskRunnerFake.taskRunner

async function scheduled(patch: Record<string, unknown> = {}, withAgent = true) {
  const project = await createProject()
  const agent = await createAgent()
  const board = await boardOf(project.id)
  const task = await taskIn(project.id, {
    title: 'Board review', boardId: board.id, assignedAgentId: withAgent ? agent.id : null, scheduleAt: DUE, scheduleNextDueAt: DUE,
    onBehalfOfUserId: 'dana', scheduleSetByUserId: 'dana', ...patch,
  })
  return { project, agent, board, task }
}

const taskRow = (id: string) => prisma.task.findUnique({ where: { id } })

describe('a scheduled task falling due', () => {
  it('is claimed once, and starts at its time through TaskRunner as the schedule, whatever the project', async () => {
    const { task, agent } = await scheduled()
    expect(await startSchedulesDue(NOW)).toBe(1)
    expect((await taskRow(task.id))!.scheduleNextDueAt).toBeNull()
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'schedule', agent: expect.objectContaining({ id: agent.id }) })])
  })

  it('a claim lost to another tick starts nothing: two ticks start it once', async () => {
    const { task } = await scheduled()
    await Promise.all([startSchedulesDue(NOW), startSchedulesDue(NOW)])
    expect(runner.runTask.mock.calls.filter(c => c[0] === task.id)).toHaveLength(1)
  })

  it('takes everything due within the tick\'s minute, and nothing due later or archived', async () => {
    const early = await scheduled({ scheduleNextDueAt: new Date('2026-10-03T09:00:50Z') })
    const later = await scheduled({ scheduleNextDueAt: new Date('2026-10-03T09:02:00Z') })
    const archived = await scheduled({ archived: true })
    await startSchedulesDue(NOW)
    expect(runner.runTask.mock.calls.map(c => c[0])).toEqual([early.task.id])
    expect((await taskRow(later.task.id))!.scheduleNextDueAt).not.toBeNull()
    expect((await taskRow(archived.task.id))!.scheduleNextDueAt).not.toBeNull()
  })

  it('is asked to start, as the schedule, at depth 0 and queued by the person who set it — a person set it (adr-0089, adr-0091)', async () => {
    const { task } = await scheduled({ scheduleSetByUserId: 'erin', queueDepth: 3 })
    await startSchedulesDue(NOW)
    expect(await taskRow(task.id)).toMatchObject({
      runState: 'RUN_QUEUED', runStartedBy: 'schedule', queueDepth: 0, queuedByUserId: 'erin', queuedByAgentId: null,
    })
  })

  it('an epic is never started at its time', async () => {
    const { task } = await scheduled({ isEpic: true })
    await startSchedulesDue(NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect((await taskRow(task.id))!.runState).toBe('RUN_NONE')
  })

  it('tells its board when it asks to start it', async () => {
    const { task, board } = await scheduled()
    await startSchedulesDue(NOW)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    expect((await taskRow(task.id))!.boardId).toBe(board.id)
  })

  it('already running (a person pressed Run first) — that run is this occurrence', async () => {
    const { task } = await scheduled({ runState: 'RUN_ACTIVE', runStartedBy: 'person' })
    await startSchedulesDue(NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person', scheduleNextDueAt: null })
  })

  it('a run a person asked for meanwhile is not started over: the task is read, then a person presses Run', async () => {
    const { task } = await scheduled()
    const realFindMany = prisma.task.findMany.bind(prisma.task)
    const spy = vi.spyOn(prisma.task, 'findMany').mockImplementationOnce(((args: any) =>
      realFindMany(args).then(async rows => {
        await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE', runStartedBy: 'person' } })
        return rows
      })) as never)
    await startSchedulesDue(NOW)
    spy.mockRestore()
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person' })
  })
})

describe('a scheduled time reached when the task cannot start', () => {
  it.each([
    ['blocked because its person lost access', { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON }],
    ['failed', { runState: 'RUN_FAILED', runStateReason: 'boom' }],
  ])('a task whose last run is %s waits for a person: not queued', async (_what, state) => {
    const { task } = await scheduled(state)
    await startSchedulesDue(NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ ...state, scheduleNextDueAt: null })
  })

  it('with no agent assigned, says so — once: a task starts at most once (adr-0092)', async () => {
    const { task } = await scheduled({}, false)
    await startSchedulesDue(NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_NONE', runStateReason: NO_AGENT_REASON, scheduleNextDueAt: null })
    await startSchedulesDue(NOW)
    expect(runner.runTask).not.toHaveBeenCalled()
  })
})
