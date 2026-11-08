/**
 * An agent's Stop and Stop every run, against the real database (spec D17, N4, RU4): every waiting task of theirs
 * goes back to Not started — in line, or for a Run at… time — running work is stopped, and nothing more starts until
 * someone starts it. Races: a run ending while Stop runs, a claim landing between Stop's read and its write, and a
 * Stop landing while a dispatch is on its way. Only the site is stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, startsLanded } from '../../agents/__tests__/taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { stopAgent, takeOutOfLine } from '../agentStop'
import { startAgent } from '../agentStart'
import { taskRunner } from '../../agents/TaskRunner'
import { createAgent, ensureExecutionSite } from '../../test/factories'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteFake from '../../test/fakes/siteRuntimeStore'

beforeEach(async () => { socket.emitTaskUpdated.mockReset(); await ensureExecutionSite({ siteId: 'site-1' }) })

const later = () => new Date(Date.now() + 6 * 3_600_000)
const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe("an agent's Stop", () => {
  it('takes every waiting task of the agent out of line, back to Not started, its Run at… times included', async () => {
    const w = await agentInProject()
    const queued = await addTask(w, { runStartedBy: 'person', executionState: 'WAITING' })
    const held = await addTask(w, { runStartedBy: 'person', runStateReason: 'held — site unreachable' })
    const timed = await addTask(w, { runState: 'RUN_NONE', scheduleAt: later(), scheduleNextDueAt: later() })
    const others = await addTask({ ...w, agent: await createAgent() }, { runStartedBy: 'person' })

    expect(await stopAgent(w.project.id, w.agent.id, w.person.id, 'Sam')).toEqual({ withdrawn: 2, cancelled: 0 })
    for (const t of [queued, held]) expect(await row(t.id)).toMatchObject({ runState: 'RUN_NONE', executionState: 'NOT_STARTED', runStartedBy: null })
    expect(await row(timed.id)).toMatchObject({ scheduleAt: null, scheduleNextDueAt: null })
    expect((await row(others.id)).runState).toBe('RUN_QUEUED')
  })

  it("stops its running task, after settling it and the line, and records the stop as the person's", async () => {
    const w = await agentInProject()
    const running = await addTask(w, { runState: 'RUN_ACTIVE', runId: 'run-a', rank: 'a' })
    const next = await addTask(w, { runStartedBy: 'person', rank: 'b' })
    await prisma.agentSession.create({ data: { id: 'sess-a', agentId: w.agent.id, userId: w.person.id, sessionType: 'task', taskId: running.id } as never })
    siteFake.addRun('site-1', { id: 'run-a', sessionId: 'sess-a', status: 'RUNNING' } as never)

    const result = await stopAgent(w.project.id, w.agent.id, w.person.id, 'Sam')
    expect(result.withdrawn).toBe(1)
    expect(siteFake.cancelledRuns.map(r => r.runId)).toContain('run-a')
    expect(await Promise.all([running, next].map(async t => (await row(t.id)).runState))).toEqual(['RUN_NONE', 'RUN_NONE'])
    expect(await prisma.taskActivity.findMany({ where: { taskId: running.id, kind: 'RUN_STOPPED' } })).toHaveLength(1)
  })

  it("a run ending while Stop runs starts nothing after it: the line is already empty", async () => {
    const w = await agentInProject()
    const running = await addTask(w, { runState: 'RUN_ACTIVE', runId: 'run-a', rank: 'a' })
    const next = await addTask(w, { runStartedBy: 'person', rank: 'b' })
    await Promise.all([
      takeOutOfLine({ projectId: w.project.id, assignedAgentId: w.agent.id }),
      // The run's end frame, as the status listener would settle it and free the slot.
      prisma.task.updateMany({ where: { id: running.id, runState: 'RUN_ACTIVE', runId: 'run-a' }, data: { runState: 'RUN_NONE' } })
        .then(() => taskRunner.triggerNext(w.agent, w.project.id)),
    ])
    await startsLanded([next.id])
    // Either the Stop withdrew it first, or the end claimed it and the Stop then settled the claim: never left running.
    expect((await row(next.id)).runState).toBe('RUN_NONE')
  })

  it('a Stop landing while a dispatch is on its way cancels the run that dispatch starts', async () => {
    const w = await agentInProject()
    const task = await addTask(w, { runState: 'RUN_NONE', state: 'TODO', rank: 'c' })
    dispatchFake.dispatchTaskRun.mockImplementationOnce(async (taskId: string) => {
      await takeOutOfLine({ projectId: w.project.id, assignedAgentId: w.agent.id })
      return { runId: 'run-late', sessionId: `session-${taskId}` }
    })
    await startAgent(w.project.id, w.agent.id, [task.id], w.person.id)
    await vi.waitFor(() => expect(siteFake.cancelledRuns.map(r => r.runId)).toContain('run-late'), { timeout: 5_000 })
    expect(await row(task.id)).toMatchObject({ runState: 'RUN_NONE', runId: null })
  })
})

describe('Stop every run takes waiting tasks out of line (N4)', () => {
  it('across the project, every agent, and clears every Run at… still to come', async () => {
    const w = await agentInProject()
    const a = await addTask(w, { runStartedBy: 'person' })
    const b = await addTask({ ...w, agent: await createAgent() }, { runStartedBy: 'schedule' })
    const timed = await addTask(w, { runState: 'RUN_NONE', scheduleNextDueAt: later(), scheduleAt: later() })
    const { tasks, startTimes } = await takeOutOfLine({ projectId: w.project.id })
    expect(tasks.map(t => t.id).sort()).toEqual([a.id, b.id].sort())
    expect(startTimes).toBe(1)
    expect((await row(timed.id)).scheduleNextDueAt).toBeNull()
    expect(await taskRunner.startNext(w.agent, w.project.id)).toBeNull()
  })
})
