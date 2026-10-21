/**
 * What an agent's create_task or move queues (spec §2, adr-0091), against the
 * real test database: under the project's queue limit and maximum depth the
 * task is queued, recording the agent that queued it and its depth; past
 * either it is still created or moved, but not queued, and the result says
 * why. A person's connection is never limited and queues at depth 0.
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
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { createTaskOp, updateTaskOp } from '../taskOps'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { expectForbidden } from './controlPlaneFixtures'
import { seedAutomation, taskRun, projectAutomation, setOwnDepth, type AutomationWorld } from './automationFixtures'
import { createTestTask } from '../../../test/factories'

let w: AutomationWorld
beforeEach(async () => {
  w = await seedAutomation()
})

const DEPTH_NOTE = /maximum depth of 3/
const args = () => ({ title: 'Follow-up', projectId: w.projectId, queue: true, assignedAgentId: 'agent-2' })
const created = async (res: unknown) => prisma.task.findUniqueOrThrow({ where: { id: (res as { taskId: string }).taskId } })
/** Agents already hold `n` queued tasks in the project. */
async function agentsHold(n: number) {
  for (let i = 0; i < n; i++) {
    await createTestTask({ data: { title: `held ${i}`, projectId: w.projectId, number: 10 + i, runState: 'RUN_QUEUED', queuedByAgentId: 'agent-1', onBehalfOfUserId: w.u1 } })
  }
}

describe("the queue limit on an agent's create_task (spec §2)", () => {
  it('under the limit, queues the task and records the agent that queued it, on behalf of the task\'s person', async () => {
    const res = await createTaskOp(taskRun(w), args())
    expect(res).not.toHaveProperty('queued')
    expect(await created(res)).toMatchObject({
      runState: 'RUN_QUEUED', queueDepth: 0, queuedByAgentId: 'agent-1', queuedBySessionId: 's1', onBehalfOfUserId: w.u1,
    })
  })

  it('at the limit, still creates the task, but not queued, and the result says so', async () => {
    await projectAutomation(w.projectId, { queueLimit: 1 })
    await agentsHold(1)
    const res = await createTaskOp(taskRun(w), args())
    expect(res).toMatchObject({ success: true, queued: false, note: expect.stringMatching(/not queued/) })
    expect((await created(res)).runState).toBe('RUN_NONE')
  })

  it('applies to a task landing in an auto-queue column too', async () => {
    await projectAutomation(w.projectId, { queueLimit: 0 })
    const res = await createTaskOp(taskRun(w), { title: 'x', projectId: w.projectId, boardId: w.boardId, column: 'ready', assignedAgentId: 'agent-2' })
    expect(res).toMatchObject({ queued: false })
    expect(await created(res)).toMatchObject({ column: 'ready', runState: 'RUN_NONE' })
  })

  it('does not count a task an agent creates unqueued', async () => {
    await projectAutomation(w.projectId, { queueLimit: 0 })
    const res = await createTaskOp(taskRun(w), { title: 'x', projectId: w.projectId })
    expect(res).not.toHaveProperty('queued')
  })

  it("a person's connection creates it on behalf of its person, through the connection, with no agent's queue limit (adr-0090)", async () => {
    await projectAutomation(w.projectId, { queueLimit: 0, maxDepth: 0 })
    const res = await createTaskOp(connectionCaller({ userId: w.u1, connectionId: 'conn-9' }), args())
    expect(await created(res)).toMatchObject({
      runState: 'RUN_QUEUED', queueDepth: 0, onBehalfOfUserId: w.u1, createdByConnectionId: 'conn-9',
      queuedByUserId: w.u1, queuedByConnectionId: 'conn-9', queuedByAgentId: null,
    })
  })

  it('a connection whose person no longer reaches the project creates nothing', async () => {
    const err = await expectForbidden(createTaskOp(connectionCaller({ userId: 'gone' }), args()))
    expect(err.message).toMatch(/requires membership of this project/)
    expect(await prisma.task.count()).toBe(2)
  })

  it('an agent moving a task into an auto-queue stage at the limit moves it, unqueued', async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE' } })
    await projectAutomation(w.projectId, { queueLimit: 1 })
    await agentsHold(1)
    const res = await updateTaskOp(taskRun(w), { taskId: 't1', column: 'ready' })
    expect(res).toMatchObject({ queued: false })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: 't1' } })).toMatchObject({ column: 'ready', runState: 'RUN_NONE' })
  })
})

describe('the depth of agent-queued work (adr-0091)', () => {
  it("in a run a person started — their chat or their Run — a task the agent queues is at depth 0, whatever its own task's depth", async () => {
    await setOwnDepth(3)
    expect(await created(await createTaskOp(taskRun(w, { startedBy: 'person' }), args()))).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 0 })
  })

  it.each(['pulse', 'schedule', 'agent'] as const)('in a run the %s started, it is one deeper than the task that run is for', async (startedBy) => {
    await setOwnDepth(1)
    expect(await created(await createTaskOp(taskRun(w, { startedBy }), args()))).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 2 })
  })

  it('at the maximum it is still queued; one past it, created but not queued, and the agent is told why', async () => {
    await setOwnDepth(2)
    expect(await created(await createTaskOp(taskRun(w, { startedBy: 'pulse' }), args()))).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 3 })

    await setOwnDepth(3)
    const res = await createTaskOp(taskRun(w, { startedBy: 'pulse' }), args())
    expect(res).toMatchObject({ success: true, queued: false, note: expect.stringMatching(DEPTH_NOTE) })
    expect((await created(res)).runState).toBe('RUN_NONE')
  })

  it('moving an old, finished task back into a column that queues counts the same — recycling never resets the depth', async () => {
    await setOwnDepth(3)
    await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE', status: 'DONE' } })
    const res = await updateTaskOp(taskRun(w, { startedBy: 'pulse' }), { taskId: 't1', column: 'ready' })
    expect(res).toMatchObject({ queued: false, note: expect.stringMatching(DEPTH_NOTE) })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: 't1' } })).runState).toBe('RUN_NONE')
  })

  it('under the maximum, a move into a column that queues carries the depth with it', async () => {
    await prisma.task.update({ where: { id: 't1' }, data: { runState: 'RUN_NONE' } })
    await updateTaskOp(taskRun(w, { startedBy: 'pulse' }), { taskId: 't1', column: 'ready' })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: 't1' } })).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 1 })
  })

  it("at a maximum of 0, every task an agent queues outside a person's run waits for a person", async () => {
    await projectAutomation(w.projectId, { maxDepth: 0 })
    expect(await createTaskOp(taskRun(w, { startedBy: 'pulse' }), args())).toMatchObject({ queued: false })
    expect(await createTaskOp(taskRun(w, { startedBy: 'person' }), args())).not.toHaveProperty('queued')
  })

  it("the depth is read from the run's own task in hq, never from the call — a run no person started with no task queues nothing", async () => {
    const res = await createTaskOp(taskRun(w, { startedBy: 'pulse', taskId: null }), { ...args(), queueDepth: 0 } as never)
    expect(res).toMatchObject({ queued: false })
  })

  it("a person's connection queues at depth 0 and is never limited", async () => {
    await projectAutomation(w.projectId, { queueLimit: 0, maxDepth: 0 })
    expect(await created(await createTaskOp(connectionCaller({ userId: w.u1 }), args()))).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 0 })
  })
})
