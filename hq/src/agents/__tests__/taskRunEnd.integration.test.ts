/**
 * A run's end settles its task's run state, against the real database (@SC-339, agents own schedule spec §6).
 * `run.status` frames arrive the way a site sends them into the real status listener: on time, twice, late,
 * early, or from a site that does not own the task. Only the run the run state describes may settle it, and
 * whatever the frame changes, the agent's slot is freed and its next task asked for starts. Frames for one task
 * are taken one at a time; frames for different tasks do not wait for each other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runLimitReason } from '@agenthix/core'
import { prisma } from '../../test/db'
import { addTask, agentInProject, frame, settle, stateOf, statesOf } from './taskRunFixtures'

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
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import { taskRunner } from '../TaskRunner'
import { applyMoveToRunState } from '../../projects/taskRunMoves'
import * as dispatchFake from '../../test/fakes/dispatchService'

const listen = (e: unknown, siteId = dispatchFake.DEFAULT_SITE_ID) => listeners.get('task-machine')!(e, siteId)

beforeEach(() => socket.emitTaskUpdated.mockReset())

/** A task running run-1, and the agent's next task asked to start behind it. */
async function runningWithNext() {
  const where = await agentInProject()
  const board = await prisma.board.create({ data: { name: 'B', projectId: where.project.id } })
  const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1', boardId: board.id })
  const next = await addTask(where, { runStartedBy: 'person' })
  return { ...where, board, task, next }
}

describe('the run end settles the run state', () => {
  it.each([
    ['COMPLETED', null, 'RUN_NONE', null],
    ['FAILED', 'boom', 'RUN_FAILED', 'boom'],
    ['FAILED', null, 'RUN_FAILED', 'run failed'],
    ['CANCELLED', 'cancelled', 'RUN_NONE', null],
  ] as const)('a %s frame (error %s) settles it %s, and the next task asked for starts', async (status, error, runState, reason) => {
    const { task, next } = await runningWithNext()
    await listen(frame(task.id, 'run-1', { status, error }))
    await settle()
    expect(await stateOf(task.id)).toMatchObject({ runState, runStateReason: reason, runId: 'run-1' })
    expect(await stateOf(next.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person' })
  })

  it('a run stopped at its limit is blocked with the reason that names the limit', async () => {
    const { task, next } = await runningWithNext()
    const reason = runLimitReason('time', { timeLimitMinutes: 60, turnLimit: 100 })
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: reason }))
    await settle()
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: reason })
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
  })

  it('a run that asked for approval and was stopped at its limit keeps the limit beside the request @SC-644', async () => {
    const { task, agent } = await runningWithNext()
    const limit = runLimitReason('turns', { timeLimitMinutes: 60, turnLimit: 100 })
    const manifestPending = { runId: 'run-1', summary: null, pendingManifest: { tools: [{ name: 'bash' }], bashPatterns: [] } }
    // A real agent: the approval comment the request writes names it.
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: limit, manifestPending, agentId: agent.id }))
    await settle()
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: `Awaiting tool approval — ${limit}` })
  })

  it("tells the task's board when it settles it, and not again for a duplicate", async () => {
    const { task, board } = await runningWithNext()
    await listen(frame(task.id, 'run-1'))
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    socket.emitTaskUpdated.mockReset()
    await listen(frame(task.id, 'run-1'))
    expect(socket.emitTaskUpdated).not.toHaveBeenCalledWith(board.id)
  })

  it('a duplicate end changes nothing and starts nothing twice', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1' })
    const second = await addTask(where, { runStartedBy: 'pulse' })
    const third = await addTask(where, { runStartedBy: 'pulse' })

    await listen(frame(task.id, 'run-1'))
    await settle()
    await listen(frame(task.id, 'run-1'))
    await settle()

    expect(await statesOf([task.id, second.id, third.id])).toEqual(['RUN_NONE', 'RUN_ACTIVE', 'RUN_QUEUED'])
    expect(dispatchFake.dispatchedTaskRuns).toHaveLength(1)
  })

  it("a person's Stop settled it first: the cancel that follows changes nothing but frees the slot", async () => {
    const { task, next } = await runningWithNext()
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_NONE' } })
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: 'cancelled' }))
    await settle()
    expect((await stateOf(task.id)).runState).toBe('RUN_NONE')
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
  })

  it("an earlier run's late end does not settle the run started after it", async () => {
    const { task } = await runningWithNext()
    await prisma.task.update({ where: { id: task.id }, data: { runId: 'run-2' } })
    await listen(frame(task.id, 'run-1', { status: 'FAILED', error: 'boom' }))
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runId: 'run-2' })
  })

  it('an end that beats the dispatch acknowledgement settles the run, and the late acknowledgement leaves it settled', async () => {
    const where = await agentInProject()
    const task = await addTask(where)
    dispatchFake.dispatchTaskRun.mockImplementationOnce(async (taskId: string) => {
      await listen(frame(taskId, 'run-fast', { status: 'FAILED', error: 'image missing' }))
      return { runId: 'run-fast', sessionId: 's' }
    })
    await taskRunner.runTask(task.id, where.agent)
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'image missing', runId: 'run-fast' })
  })

  it('a bare RUNNING frame changes nothing and starts nothing', async () => {
    const { task, next } = await runningWithNext()
    await listen(frame(task.id, 'run-1', { status: 'RUNNING' }))
    await settle()
    expect(await statesOf([task.id, next.id])).toEqual(['RUN_ACTIVE', 'RUN_QUEUED'])
  })

  it('a frame from a site that does not own the task changes nothing and starts nothing', async () => {
    const { task, next } = await runningWithNext()
    await listen(frame(task.id, 'run-1'), 'site-2')
    await settle()
    expect(await statesOf([task.id, next.id])).toEqual(['RUN_ACTIVE', 'RUN_QUEUED'])
  })

  it('a frame with no task changes nothing', async () => {
    const { task } = await runningWithNext()
    await listen(frame(null, 'run-1'))
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
  })
})

describe('whatever the agent does to its tasks mid-run, the batch carries on', () => {
  it('finding 2: its running task moved to done before the end — the end still settles it and starts the next', async () => {
    const { task, next } = await runningWithNext()
    await applyMoveToRunState(task.id, { status: 'DONE', autoQueue: false }, { queuer: null })
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')

    await listen(frame(task.id, 'run-1'))
    await settle()
    expect(await statesOf([task.id, next.id])).toEqual(['RUN_NONE', 'RUN_ACTIVE'])
  })
})

describe('frames for one task are taken one at a time', () => {
  it('a second frame for the same task waits until the first has settled it', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: null })
    let release!: () => void
    dispatchFake.resolveSiteIdForTask.mockImplementationOnce(async () => {
      await new Promise<void>(r => { release = r })
      return dispatchFake.DEFAULT_SITE_ID
    })

    const first = listen(frame(task.id, 'run-a', { status: 'FAILED', error: 'first' }))
    const second = listen(frame(task.id, 'run-b', { status: 'FAILED', error: 'second' }))
    await settle()
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
    release()
    await Promise.all([first, second])

    // Taken in turn, the first settles it and the second finds a run no longer current.
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'first', runId: 'run-a' })
  })

  it('frames for different tasks do not wait for each other', async () => {
    const where = await agentInProject()
    const a = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-a' })
    const other = await agentInProject()
    const b = await addTask(other, { runState: 'RUN_ACTIVE', runId: 'run-b' })
    let release!: () => void
    dispatchFake.resolveSiteIdForTask.mockImplementation(async (taskId: string) => {
      if (taskId === a.id) await new Promise<void>(r => { release = r })
      return dispatchFake.DEFAULT_SITE_ID
    })

    const pa = listen(frame(a.id, 'run-a', { status: 'FAILED', error: 'a' }))
    await listen(frame(b.id, 'run-b', { status: 'FAILED', error: 'b' }))
    expect(await statesOf([a.id, b.id])).toEqual(['RUN_ACTIVE', 'RUN_FAILED'])

    release()
    await pa
    expect((await stateOf(a.id)).runState).toBe('RUN_FAILED')
  })
})
