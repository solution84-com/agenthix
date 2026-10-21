/**
 * run_task over the control plane (adr-0087, adr-0091), against the real
 * test database: it starts only a queued task, says why when it does not, and
 * only a run a person started may call it — the run it starts is the agent's,
 * so one press of Run never becomes an unbounded chain.
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
const setState = (runState: 'RUN_NONE' | 'RUN_FAILED' | 'RUN_BLOCKED' | 'RUN_ACTIVE' | 'RUN_THROTTLED') =>
  prisma.task.update({ where: { id: 't1' }, data: { runState } })

describe('run_task', () => {
  it.each([
    ['RUN_NONE', /is not queued/],
    ['RUN_FAILED', /failed its last run/],
    ['RUN_BLOCKED', /blocked until a person acts/],
    ['RUN_ACTIVE', /already running/],
  ] as const)('fails with a message on a %s task instead of doing nothing', async (state, message) => {
    await setState(state)
    await expectCode(runTaskOp(taskRun(w), { taskId: 't1' }), 'invalid', message)
    expect(runTask).not.toHaveBeenCalled()
  })

  it('starts a throttled task as well as a queued one', async () => {
    await setState('RUN_THROTTLED')
    await runTaskOp(taskRun(w), { taskId: 't1' })
    expect(runTask).toHaveBeenCalled()
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
    await expectCode(runTaskOp(taskRun(w, { startedBy: startedAs, taskId: 't1' }), { taskId: 't1' }), 'forbidden', /agent started/)
    expect(runTask).not.toHaveBeenCalled()
  })

  it.each(['pulse', 'schedule', 'agent'] as const)("a run the %s started cannot start other tasks — that is the pulse's job", async (startedBy) => {
    await expectCode(runTaskOp(taskRun(w, { startedBy }), { taskId: 't1' }), 'forbidden', new RegExp(startedBy))
    expect(runTask).not.toHaveBeenCalled()
  })

  it.each([
    [true, /starts when its agent is free/],
    [false, /waits for a person to run it or turn automation on/],
  ])("the refusal says what happens to the task by the project's automation (on: %s)", async (enabled, message) => {
    await projectAutomation(w.projectId, { enabled })
    await expectCode(runTaskOp(taskRun(w, { startedBy: 'pulse' }), { taskId: 't1' }), 'forbidden', message)
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
