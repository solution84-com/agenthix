/**
 * An agent's or a person's create_task and update_task start nothing (adr-0175, spec D6): whatever column, state or
 * agent a task is given, it is created or moved with no run pending. Only create_task asked to start (`queue`) starts
 * one, through the start gate (startGate.integration.test.ts). Who it is for is the run's person, or a connection's (adr-0090). Against the real test database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { createTaskOp, updateTaskOp } from '../taskOps'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { expectForbidden } from './controlPlaneFixtures'
import { seedAutomation, taskRun, projectAutomation, type AutomationWorld } from './automationFixtures'

let w: AutomationWorld
beforeEach(async () => {
  w = await seedAutomation()
  await prisma.projectAgent.createMany({ data: [{ projectId: w.projectId, agentId: 'agent-1' }, { projectId: w.projectId, agentId: 'agent-2' }] })
})

const created = async (res: { taskId: string }) => prisma.task.findUniqueOrThrow({ where: { id: res.taskId } })

describe("create_task starts nothing unless asked to @SC-111", () => {
  it('an agent in a run nobody started, asked to start it, still only creates it, and says why', async () => {
    const res = await createTaskOp(taskRun(w, { startedBy: 'pulse' }), { title: 'x', projectId: w.projectId, assignedAgentId: 'agent-2', queue: true })
    expect(res).toMatchObject({ queued: false, note: expect.stringMatching(/not started/) })
    expect(await created(res)).toMatchObject({ runState: 'RUN_NONE' })
  })

  it.each(['BACKLOG', 'TODO', 'IN_PROGRESS'] as const)('an agent creating an assigned task in %s leaves it with no run pending', async (state) => {
    const res = await createTaskOp(taskRun(w, { startedBy: 'pulse' }), { title: 'x', projectId: w.projectId, state, assignedAgentId: 'agent-2' })
    expect(await created(res)).toMatchObject({ state, runState: 'RUN_NONE', executionState: 'NOT_STARTED', assignedAgentId: 'agent-2' })
    expect(res).not.toHaveProperty('queued')
  })

  it('reads no depth when not asked to start: a maximum of 0 does not refuse a task', async () => {
    await projectAutomation(w.projectId, { maxDepth: 0 })
    const res = await createTaskOp(taskRun(w, { startedBy: 'pulse' }), { title: 'x', projectId: w.projectId, state: 'TODO', assignedAgentId: 'agent-2' })
    expect(await created(res)).toMatchObject({ runState: 'RUN_NONE', queueDepth: 0 })
  })

  it("a person's connection creates it on behalf of its person, through the connection (adr-0090)", async () => {
    const res = await createTaskOp(connectionCaller({ userId: w.u1, connectionId: 'conn-9' }), { title: 'x', projectId: w.projectId, assignedAgentId: 'agent-2' })
    expect(await created(res)).toMatchObject({ runState: 'RUN_NONE', onBehalfOfUserId: w.u1, createdByConnectionId: 'conn-9', state: 'BACKLOG' })
  })

  it('a connection whose person no longer reaches the project creates nothing', async () => {
    const err = await expectForbidden(createTaskOp(connectionCaller({ userId: 'gone' }), { title: 'x', projectId: w.projectId }))
    expect(err.message).toMatch(/requires membership of this project/)
    expect(await prisma.task.count()).toBe(2)
  })

  it('refuses an agent that is not in the project, and creates nothing', async () => {
    await prisma.agent.create({ data: { id: 'agent-3', name: 'Three', handle: 'c' } })
    await expect(createTaskOp(taskRun(w), { title: 'x', projectId: w.projectId, assignedAgentId: 'agent-3' }))
      .rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/not assigned to this project/) })
    expect(await prisma.task.count()).toBe(2)
  })
})

describe('update_task starts nothing', () => {
  it('moving a finished task back to To do, assigned, leaves it with no run pending', async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE' } })
    await updateTaskOp(taskRun(w, { startedBy: 'pulse' }), { taskId: 't1', state: 'DONE' })
    await updateTaskOp(taskRun(w, { startedBy: 'pulse' }), { taskId: 't1', state: 'TODO', assignedAgentId: 'agent-1' })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: 't1' } })).toMatchObject({ state: 'TODO', runState: 'RUN_NONE', assignedAgentId: 'agent-1' })
  })
})
