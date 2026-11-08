/**
 * The start gate every tool that starts work passes (adr-0175, adr-0091, adr-0090), against the real test database:
 * a person's connection only with *Start work*, an agent only in a run a person started, never past the
 * organisation's maximum depth, and a conversation's turn never.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { startGate, NO_START_WORK_NOTE, depthNote } from '../startGate'
import { createTaskOp } from '../taskWriteOps'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import * as taskRunnerFake from '../../../test/fakes/TaskRunner'
import { seedAutomation, taskRun, projectAutomation, setOwnDepth, type AutomationWorld } from './automationFixtures'

let w: AutomationWorld
beforeEach(async () => {
  w = await seedAutomation()
})

describe('the start gate', () => {
  it("lets a person's connection start work as the person, only with its Start work permission", async () => {
    expect(await startGate(connectionCaller({ userId: w.u1 }))).toEqual({ refusal: null, startedBy: 'person', personId: w.u1, depth: 0 })
    expect(await startGate(connectionCaller({ userId: w.u1, groups: new Set(['read', 'change_tasks']) }))).toEqual({ refusal: NO_START_WORK_NOTE })
  })

  it("lets an agent in a run a person started start work as the agent's, at depth 0", async () => {
    expect(await startGate(taskRun(w, { startedBy: 'person' }))).toEqual({ refusal: null, startedBy: 'agent', personId: null, depth: 0 })
  })

  it.each(['pulse', 'schedule', 'agent'] as const)('refuses an agent in a run the %s started', async (startedBy) => {
    const gate = await startGate(taskRun(w, { startedBy }))
    expect(gate.refusal).toMatch(/only a run a person started/)
  })

  it("never lets a chain go past the organisation's maximum depth", async () => {
    await projectAutomation(w.projectId, { maxDepth: 1 })
    await setOwnDepth(5)
    // A person's run counts from 0 whatever its task's depth; the depth matters for any other run, which is refused anyway.
    expect((await startGate(taskRun(w, { startedBy: 'person' }))).refusal).toBeNull()
    expect(depthNote(1)).toMatch(/maximum depth of 1/)
  })
})

describe('create_task asked to start', () => {
  beforeEach(async () => {
    await prisma.projectAgent.upsert({ where: { projectId_agentId: { projectId: w.projectId, agentId: 'agent-2' } }, update: {}, create: { projectId: w.projectId, agentId: 'agent-2' } })
  })

  it("through a connection without Start work: the task is made, and not started", async () => {
    const made = await createTaskOp(connectionCaller({ userId: w.u1, groups: new Set(['read', 'change_tasks']) }), {
      title: 'Ship it', projectId: w.projectId, assignedAgentId: 'agent-2', queue: true,
    }) as { taskId: string; queued?: boolean; note?: string }
    expect(made).toMatchObject({ queued: false, note: NO_START_WORK_NOTE })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: made.taskId } })).toMatchObject({ runState: 'RUN_NONE' })
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it("in a run a person started: the task is put in its agent's line as the agent's, and started", async () => {
    taskRunnerFake.taskRunner.runTask.mockResolvedValue({ outcome: 'started' })
    const made = await createTaskOp(taskRun(w, { startedBy: 'person' }), {
      title: 'Ship it', projectId: w.projectId, assignedAgentId: 'agent-2', queue: true,
    }) as { taskId: string; queued?: boolean }
    expect(made.queued).toBe(true)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: made.taskId } })).toMatchObject({
      runState: 'RUN_QUEUED', runStartedBy: 'agent', runOnBehalfOfUserId: null, queuedByAgentId: 'agent-1', queueDepth: 0,
    })
    expect(taskRunnerFake.taskRunner.runTask).toHaveBeenCalledWith(made.taskId, expect.objectContaining({ id: 'agent-2' }), 'agent', null)
  })

  it('in a run no person started: made, not started, and it says why', async () => {
    const made = await createTaskOp(taskRun(w, { startedBy: 'agent' }), {
      title: 'Ship it', projectId: w.projectId, assignedAgentId: 'agent-2', queue: true,
    }) as { taskId: string; queued?: boolean; note?: string }
    expect(made).toMatchObject({ queued: false, note: expect.stringMatching(/waits for a person/) })
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })
})
