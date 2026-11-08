/**
 * A routine's round starts at its time (adr-0104), against Postgres: the routine
 * makes the round's time a start time that is due, and the start-time path
 * starts it as if its person pressed Run, whatever its column; with no agent it
 * waits. What delays a start time delays a round the same way. TaskRunner is the
 * shared fake. Run by the lead.
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
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createRoundsDue } from '../routineRounds'
import { startSchedulesDue, NO_AGENT_REASON } from '../scheduledStart'
import { createRoutine } from '../routines'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { assignAgent, boardOf, DAILY } from './automationWorld'

const runner = taskRunnerFake.taskRunner
const SET_UP = new Date('2026-10-05T08:00:00Z')
const FIRST = new Date('2026-10-05T09:00:00Z')
const SECOND = new Date('2026-10-06T09:00:00Z')
const tickAt = (at: Date) => new Date(at.getTime() + 20_000)

/** One tick's routine and start-time steps, in the scheduler's order. */
async function tick(at: Date) {
  await createRoundsDue(at)
  await startSchedulesDue(at)
}

async function setUp(opts: { column?: string; agent?: boolean } = {}) {
  const project = await createProject()
  const board = await boardOf(project.id)
  const agent = await createAgent()
  await assignAgent(project.id, agent.id)
  const routine = await createRoutine(
    project.id,
    {
      title: 'Site audit', description: null, priority: 'MEDIUM', labels: [],
      assignedAgentId: opts.agent === false ? null : agent.id, boardId: board.id, column: opts.column ?? 'todo',
    },
    { rule: DAILY, at: FIRST.toISOString(), timezone: 'UTC' },
    { kind: 'person', userId: 'avery' },
    SET_UP,
  )
  return { project, board, agent, routine }
}

const rounds = (routineId: string) => prisma.task.findMany({ where: { routineId }, orderBy: { roundAt: 'asc' } })
const started = () => taskRunnerFake.startedTasks.map(s => s.taskId)

describe('at its time, a round with an agent starts as if its person pressed Run @SC-681', () => {
  it.each([
    ['a To do column', 'todo'],
    ['another To do column', 'ready'],
    ["its board's Backlog", null],
  ])('in %s', async (_what, column) => {
    const { routine, agent } = await setUp({ column: column as string })
    await tick(tickAt(FIRST))
    const [round, next] = await rounds(routine.id)
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: round.id, startedBy: 'schedule', agent: expect.objectContaining({ id: agent.id }) })])
    expect(round).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'schedule', queuedByUserId: 'avery', queueDepth: 0, scheduleNextDueAt: null })
    expect(next).toMatchObject({ roundAt: SECOND, runState: 'RUN_NONE', scheduleNextDueAt: null })
  })

  it('starts once, however many ticks reach it', async () => {
    const { routine } = await setUp()
    await Promise.all([tick(tickAt(FIRST)), tick(tickAt(FIRST))])
    await tick(tickAt(FIRST))
    const [round] = await rounds(routine.id)
    expect(runner.runTask.mock.calls.filter(c => c[0] === round.id)).toHaveLength(1)
  })

  it('waits for its agent when the agent is already busy in the project, as a start time does', async () => {
    const { routine } = await setUp()
    runner.runTask.mockResolvedValue({ outcome: 'waiting' })
    await tick(tickAt(FIRST))
    const [round] = await rounds(routine.id)
    expect(round).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'schedule' })
  })
})

describe('what keeps a round from starting at its time @SC-682', () => {
  it('no agent: it waits for a person, and says so; the next round is still created', async () => {
    const { routine } = await setUp({ agent: false })
    await tick(tickAt(FIRST))
    const [round, next] = await rounds(routine.id)
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(round).toMatchObject({ runState: 'RUN_NONE', runStateReason: NO_AGENT_REASON, scheduleNextDueAt: null })
    expect(next.roundAt).toEqual(SECOND)
  })

  it.each([
    ['still running', { runState: 'RUN_ACTIVE', runStartedBy: 'person', runId: 'run-1' }],
    ['already finished', { runState: 'RUN_NONE', runId: 'run-1' }],
    ['asked to start and waiting for its agent', { runState: 'RUN_QUEUED', runStartedBy: 'person' }],
    ['failed', { runState: 'RUN_FAILED', runStateReason: 'boom', runId: 'run-1' }],
  ])('a round a person already started by hand (%s) is not started again', async (_what, state) => {
    const { routine } = await setUp()
    const [waiting] = await rounds(routine.id)
    await prisma.task.update({ where: { id: waiting.id }, data: state as any })
    await tick(tickAt(FIRST))
    expect(runner.runTask).not.toHaveBeenCalled()
    expect(await prisma.task.findUnique({ where: { id: waiting.id } })).toMatchObject({ ...state, scheduleNextDueAt: null })
    expect((await rounds(routine.id))[1].roundAt).toEqual(SECOND)
  })
})

describe('one round going wrong does not stop the next @SC-682', () => {
  it('a failed round stays failed, to be run again; the next round starts at its own time', async () => {
    const { routine } = await setUp()
    await tick(tickAt(FIRST))
    const [first] = await rounds(routine.id)
    await prisma.task.update({ where: { id: first.id }, data: { runState: 'RUN_FAILED', runStateReason: 'timed out', runId: 'run-1' } })
    runner.runTask.mockClear()
    taskRunnerFake.startedTasks.length = 0

    await tick(tickAt(SECOND))
    const [failed, second, third] = await rounds(routine.id)
    expect(failed).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'timed out' })
    expect(started()).toEqual([second.id])
    expect(third.roundAt).toEqual(new Date('2026-10-07T09:00:00Z'))
  })
})
