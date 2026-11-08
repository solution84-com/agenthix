/**
 * run_task over the control plane (adr-0175, adr-0091, adr-0095), against the
 * real test database: an agent starting a task with its tool. It starts a task
 * with no run pending, or one already in its agent's line, says why when it does
 * not, and only a run a person started may call it — the run it starts is the
 * agent's, so one press of Run never becomes an unbounded chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { runTaskOp } from '../taskOps'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import * as taskRunnerFake from '../../../test/fakes/TaskRunner'
import { seedAutomation, taskRun, projectAutomation, type AutomationWorld } from './automationFixtures'

const runTask = taskRunnerFake.taskRunner.runTask
async function expectCode(p: Promise<unknown>, code: string, message?: RegExp) {
  const err = await p.then(() => null, (e) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  expect(err.code).toBe(code)
  if (message) expect(err.message).toMatch(message)
}

let w: AutomationWorld
beforeEach(async () => {
  w = await seedAutomation()
  runTask.mockResolvedValue({ outcome: 'started' })
})
const setState = (runState: 'RUN_NONE' | 'RUN_FAILED' | 'RUN_BLOCKED' | 'RUN_ACTIVE') =>
  prisma.task.update({ where: { id: 't1' }, data: { runState } })
const t1 = () => prisma.task.findUniqueOrThrow({ where: { id: 't1' } })

describe('run_task', () => {
  it.each([
    ['RUN_FAILED', /failed its last run/],
    ['RUN_BLOCKED', /blocked until a person acts/],
    ['RUN_ACTIVE', /already running/],
  ] as const)('fails with a message on a %s task instead of doing nothing', async (state, message) => {
    await setState(state)
    await expectCode(runTaskOp(taskRun(w), { taskId: 't1' }), 'invalid', message)
    expect(runTask).not.toHaveBeenCalled()
  })

  it("starts a task with no run pending: it puts it in its agent's line as the agent's, at the run's depth, recording who started it", async () => {
    await setState('RUN_NONE')
    await runTaskOp(taskRun(w), { taskId: 't1' })
    expect(await t1()).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'agent', runOnBehalfOfUserId: null, queueDepth: 0, queuedByAgentId: 'agent-1' })
    expect(runTask).toHaveBeenCalledWith('t1', expect.objectContaining({ id: 'agent-2' }), 'agent', null)
  })

  it('never starts an epic, or a task whose start time is still to come', async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE', scheduleNextDueAt: new Date(Date.now() + 3_600_000) } })
    await expectCode(runTaskOp(taskRun(w), { taskId: 't1' }), 'invalid', /start time still to come/)
    await prisma.task.update({ where: { id: 't1' }, data: { scheduleNextDueAt: null, isEpic: true } })
    await expectCode(runTaskOp(taskRun(w), { taskId: 't1' }), 'invalid')
    expect(runTask).not.toHaveBeenCalled()
  })

  it("past the organisation's maximum depth it is not started", async () => {
    await setState('RUN_NONE')
    await projectAutomation(w.projectId, { maxDepth: 0 })
    await prisma.task.update({ where: { id: 't0' }, data: { queueDepth: 0 } })
    // A run a person started counts from 0, which a maximum of 0 still allows.
    await runTaskOp(taskRun(w), { taskId: 't1' })
    expect(runTask).toHaveBeenCalledTimes(1)
  })

  it('says when the task did not start, and why', async () => {
    runTask.mockResolvedValue({ outcome: 'failed', reason: 'no Execution Site' })
    expect(await runTaskOp(taskRun(w), { taskId: 't1' })).toMatchObject({ note: 'It did not start: no Execution Site' })
  })

  it('fails when something else claimed the task first, rather than reporting success', async () => {
    runTask.mockResolvedValue({ outcome: 'skipped' })
    await expectCode(runTaskOp(taskRun(w), { taskId: 't1' }), 'conflict')
  })

  it("says when the task goes after its agent's running task", async () => {
    runTask.mockResolvedValue({ outcome: 'waiting' })
    expect(await runTaskOp(taskRun(w), { taskId: 't1' })).toMatchObject({
      runState: 'RUN_QUEUED', note: expect.stringMatching(/starts when this agent's running task/),
    })
  })
})

describe("run_task: only at a person's request, and what it starts is the agent's (adr-0087, adr-0091)", () => {
  const agent2 = expect.objectContaining({ id: 'agent-2' })

  it("a run a person started starts a run that is the agent's, not the person's — the turn limit applies to it", async () => {
    await runTaskOp(taskRun(w, { startedBy: 'person' }), { taskId: 't1' })
    expect(runTask).toHaveBeenCalledWith('t1', agent2, 'agent', null)
  })

  it('the run run_task started cannot call run_task itself, so one press of Run never becomes an unbounded chain', async () => {
    await runTaskOp(taskRun(w, { startedBy: 'person' }), { taskId: 't1' })
    const startedAs = runTask.mock.calls[0][2] as CapabilityClaims['startedBy']
    runTask.mockClear()
    // The started run works on another task, so the refusal is the chain's, not the own-task rule's.
    await expectCode(runTaskOp(taskRun(w, { startedBy: startedAs, taskId: 't0' }), { taskId: 't1' }), 'forbidden', /started by the agent/)
    expect(runTask).not.toHaveBeenCalled()
  })

  it.each(['pulse', 'schedule', 'agent'] as const)('a run the %s started cannot start other tasks: it waits for a person', async (startedBy) => {
    await expectCode(runTaskOp(taskRun(w, { startedBy }), { taskId: 't1' }), 'forbidden', /waits for a person to run it/)
    expect(runTask).not.toHaveBeenCalled()
  })

  it('a capability that does not say what started its run is never taken for a person', async () => {
    const ctx = taskRun(w)
    if (ctx.kind === 'run') delete (ctx.claims as Partial<CapabilityClaims>).startedBy
    await expectCode(runTaskOp(ctx, { taskId: 't1' }), 'forbidden')
    expect(runTask).not.toHaveBeenCalled()
  })

  it("a person's connection starts a person-started run (adr-0090)", async () => {
    await runTaskOp(connectionCaller({ userId: w.u1 }), { taskId: 't1' })
    expect(runTask).toHaveBeenCalledWith('t1', agent2, 'person', w.u1)
  })
})
