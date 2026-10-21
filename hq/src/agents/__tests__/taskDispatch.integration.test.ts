/**
 * Starting a task, against the real database (@SC-115, @SC-340): TaskRunner claims it under the (agent, project)
 * lock, dispatches it as whatever started it, records the run it was given, and settles a dispatch that failed
 * — held for its site's reconnect, failed with the reason, or blocked for its person's lost access — before
 * starting the agent's next task asked for. Only the site is stood in for, by the dispatchService fake.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, settle, startsLanded, stateOf } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { TaskRunner } from '../TaskRunner'
import { DISPATCH_DECLINED_REASON, HELD_FOR_RECONNECT_REASON, WAITING_FOR_AGENT_REASON } from '../taskExecutionReasons'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { PackageDeliveryError } from '../../packages/packageDelivery'
import { LOST_ACCESS_REASON, OnBehalfOfLostAccessError } from '../../projects/taskOnBehalfOf'
import { setSchedulerWake } from '../../automation/schedulerNudge'
import * as dispatchFake from '../../test/fakes/dispatchService'

const runner = new TaskRunner()
const wake = vi.fn()

beforeEach(() => {
  socket.emitTaskUpdated.mockReset()
  wake.mockReset()
  setSchedulerWake(wake)
})
afterEach(() => setSchedulerWake(null))

describe('runTask', () => {
  it('claims the task and dispatches it as what started it, recording the run it was given', async () => {
    const where = await agentInProject()
    const task = await addTask(where)

    expect(await runner.runTask(task.id, where.agent, 'pulse')).toEqual({ outcome: 'started' })

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'pulse', runId: 'run-1' })
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledWith(task.id, expect.objectContaining({ id: where.agent.id }), 'pulse')
  })

  it("a run an agent starts is dispatched as the agent's, never as a person's (adr-0091)", async () => {
    const where = await agentInProject()
    const task = await addTask(where)
    await runner.runTask(task.id, where.agent, 'agent')
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledWith(task.id, expect.anything(), 'agent')
    expect((await stateOf(task.id)).runStartedBy).toBe('agent')
  })

  it('records the run only while the claim still stands — a Stop during the dispatch wins', async () => {
    const where = await agentInProject()
    const task = await addTask(where)
    dispatchFake.dispatchTaskRun.mockImplementationOnce(async (taskId: string) => {
      await prisma.task.update({ where: { id: taskId }, data: { runState: 'RUN_NONE', runStateReason: null } })
      return { runId: 'run-late', sessionId: 's' }
    })

    await runner.runTask(task.id, where.agent)

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_NONE', runId: null })
  })

  it('skips a task with no run pending, and one that does not exist, dispatching nothing', async () => {
    const where = await agentInProject()
    const idle = await addTask(where, { runState: 'RUN_NONE' })

    expect(await runner.runTask(idle.id, where.agent)).toEqual({ outcome: 'skipped' })
    expect(await runner.runTask('no-such-task', where.agent)).toEqual({ outcome: 'skipped' })

    expect((await stateOf(idle.id)).runState).toBe('RUN_NONE')
    expect(dispatchFake.dispatchedTaskRuns).toHaveLength(0)
  })

  it('stays queued, asked to start, while the agent runs another task in the project — it goes next', async () => {
    const where = await agentInProject()
    await addTask(where, { runState: 'RUN_ACTIVE' })
    const task = await addTask(where)

    expect(await runner.runTask(task.id, where.agent)).toEqual({ outcome: 'waiting' })

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'person', runStateReason: WAITING_FOR_AGENT_REASON })
    expect(dispatchFake.dispatchedTaskRuns).toHaveLength(0)
  })

  it('a dispatch that found nothing to run leaves the task queued', async () => {
    const where = await agentInProject()
    const task = await addTask(where)
    dispatchFake.dispatchTaskRun.mockResolvedValueOnce(null)

    expect(await runner.runTask(task.id, where.agent)).toEqual({ outcome: 'failed', reason: DISPATCH_DECLINED_REASON })
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_QUEUED', runStateReason: null })
  })
})

describe('a dispatch that fails', () => {
  async function withNextAsked() {
    const where = await agentInProject()
    const board = await prisma.board.create({ data: { name: 'B', projectId: where.project.id } })
    const task = await addTask(where, { boardId: board.id })
    const next = await addTask(where, { runStartedBy: 'person' })
    return { ...where, board, task, next }
  }

  it('@SC-340 to an unreachable site holds the task queued for its reconnect, tells its board, and starts nothing else', async () => {
    const { agent, board, task, next } = await withNextAsked()
    dispatchFake.dispatchTaskRun.mockRejectedValueOnce(new SiteUnreachableError('Box One', 'site-1'))

    expect(await runner.runTask(task.id, agent)).toEqual({ outcome: 'failed', reason: HELD_FOR_RECONNECT_REASON })
    await settle()

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON })
    expect((await stateOf(next.id)).runState).toBe('RUN_QUEUED')
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it('@SC-340 for any other reason fails the task with it, and starts the next task asked for', async () => {
    const { agent, task, next } = await withNextAsked()
    dispatchFake.dispatchTaskRun.mockRejectedValueOnce(new Error('boom'))

    expect(await runner.runTask(task.id, agent)).toEqual({ outcome: 'failed', reason: 'boom' })
    await settle()

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'boom' })
    expect(await stateOf(next.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person' })
  })

  it('a package the site failed to store fails the task', async () => {
    const { agent, task } = await withNextAsked()
    dispatchFake.dispatchTaskRun.mockRejectedValueOnce(new PackageDeliveryError('package_delivery_failed', 'digest mismatch'))
    await runner.runTask(task.id, agent)
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'digest mismatch' })
  })

  it('a revoked site fails the task instead of holding it for a reconnect that never comes', async () => {
    const { agent, task } = await withNextAsked()
    dispatchFake.dispatchTaskRun.mockRejectedValueOnce(new SiteUnreachableError('Box One', 'site-1', 'revoked'))
    await runner.runTask(task.id, agent)
    expect(await stateOf(task.id)).toMatchObject({
      runState: 'RUN_FAILED', runStateReason: 'Execution Site "Box One" has been revoked — its workspaces are unavailable',
    })
  })

  it('for a person who lost access to the project blocks the task with that reason, and frees the slot', async () => {
    const { agent, task, next } = await withNextAsked()
    dispatchFake.dispatchTaskRun.mockRejectedValueOnce(new OnBehalfOfLostAccessError(task.id))

    expect(await runner.runTask(task.id, agent, 'pulse')).toEqual({ outcome: 'failed', reason: LOST_ACCESS_REASON })
    await settle()

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
  })
})

describe("starting the agent's next task", () => {
  it('trigger-next starts the next start someone asked for, with what asked for it, and nudges the scheduler', async () => {
    const where = await agentInProject()
    const asked = await addTask(where, { runStartedBy: 'pulse' })

    await runner.triggerNext(where.agent, where.project.id)
    await startsLanded([asked.id])

    expect(await stateOf(asked.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'pulse', runId: 'run-1' })
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledWith(asked.id, expect.anything(), 'pulse')
    expect(wake).toHaveBeenCalled()
  })

  it('trigger-next leaves the rest of the line to the pulse', async () => {
    const where = await agentInProject()
    const line = await addTask(where)

    await runner.triggerNext(where.agent, where.project.id)
    await settle()

    expect((await stateOf(line.id)).runState).toBe('RUN_QUEUED')
    expect(wake).toHaveBeenCalled()
  })

  it('startNext — the pulse — takes the rest of the line too, and answers how the start went', async () => {
    const where = await agentInProject()
    const line = await addTask(where, { title: 'Three' })

    expect(await runner.startNext(where.agent, where.project.id, true)).toEqual({
      id: line.id, title: 'Three', startedBy: 'pulse', asked: false, outcome: 'started',
    })
    expect(await stateOf(line.id)).toMatchObject({ runState: 'RUN_ACTIVE', runId: 'run-1' })
  })
})
