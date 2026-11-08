/**
 * run_task and create_task in a conversation's turn (workers and results spec, Results), against the real test
 * database: each is the person's own ask, held to their access and the project's queue limit; run_task and
 * create_task for now are an operation *queued* until the run starts, a time is an operation *scheduled*, and
 * later is a task in the backlog with no operation. The task runner is the shared fake; nothing reaches a site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { createUserWithRole } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../../../server/dashboard/debouncedPush', () => import('../../../../test/fakes/debouncedPush'))
vi.mock('../../../../agents/TaskRunner', () => import('../../../../test/fakes/TaskRunner'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
const ended = vi.hoisted(() => [] as string[])
vi.mock('../../../coordinator/mailbox', async () => {
  const { createSettleOperation } = await import('../../settle')
  const mailbox = {
    operationSettled() {},
    async operationEnded(id: string) { ended.push(id) },
    async approvalRequested() {},
  }
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as runnerFake from '../../../../test/fakes/TaskRunner'
import { openText } from '../../../sealing'
import { runTaskTool } from '../runTaskTool'
import { createTaskTool, NO_THEN_AT_A_TIME } from '../createTaskTool'
import { attachStartedRun, setTaskStart } from '../taskOperations'
import { laterLine } from '../when'
import { operationsOf, taskWorld, type TaskWorld } from './taskWorld'

const signal = new AbortController().signal
let w: TaskWorld

beforeEach(async () => {
  ended.length = 0
  w = await taskWorld()
  runnerFake.taskRunner.runTask.mockImplementation(async (taskId, agent, startedBy, personId) => {
    runnerFake.startedTasks.push({ taskId, agent, startedBy: startedBy ?? 'person', personId })
    return { outcome: 'started' }
  })
})

const runTask = (input: object, capability = w.capability) => runTaskTool.run(capability, input, { signal })
const createTask = (input: object, capability = w.capability) =>
  createTaskTool.run(capability, { orgId: 'org', projectId: w.projectId, title: 'Write the release notes', ...input }, { signal })

/** An agent holds a queued task in the project, as many as the old queue limit allowed: it no longer holds anyone back. */
async function fillQueue() {
  await prisma.task.create({
    data: {
      title: 'Queued by an agent', projectId: w.projectId, boardId: w.boardId, column: 'todo', number: 1,
      runState: 'RUN_QUEUED', queuedByAgentId: w.agentId, onBehalfOfUserId: w.personId,
    },
  })
}

describe('run_task in a turn @SC-969', () => {
  it("starts the task's run as the person's, and returns at once with an operation queued until the run starts", async () => {
    const outcome = await runTask({ taskId: w.taskId })
    expect(outcome.status).toBe('accepted')
    const [op] = await operationsOf(w.conversationId)
    expect(op).toMatchObject({
      id: (outcome as { operationId: string }).operationId, kind: 'TASK', mode: 'BACKGROUND', state: 'QUEUED',
      taskId: w.taskId, runId: null, authorisedById: w.personId, boundaryType: 'project', boundaryId: w.projectId,
      toolName: 'run_task', turnId: w.capability.turnId,
    })
    expect(openText(op.title)).toBe(`${w.projectKey}-214 Fix the resize step`)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })).toMatchObject({
      runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: w.personId, queueDepth: 0,
    })
    expect(runnerFake.startedTasks).toMatchObject([{ taskId: w.taskId, startedBy: 'person', personId: w.personId }])
  })

  it("starts a task named by its key, in any case, as it would by its id", async () => {
    const outcome = await runTask({ taskId: `${w.projectKey.toLowerCase()}-214` })
    expect(outcome.status).toBe('accepted')
    expect(await operationsOf(w.conversationId)).toMatchObject([{ taskId: w.taskId, toolName: 'run_task' }])
    expect(runnerFake.startedTasks).toMatchObject([{ taskId: w.taskId, personId: w.personId }])
  })

  it('refuses a key that names no task, saying so', async () => {
    expect(await runTask({ taskId: `${w.projectKey}-999` })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/no task with the key or id/) })
    expect(runnerFake.startedTasks).toEqual([])
  })

  it('is the same operation when asked again while it is pending, and starts nothing twice', async () => {
    const first = await runTask({ taskId: w.taskId })
    const again = await runTask({ taskId: w.taskId })
    expect(again).toEqual(first)
    expect(await operationsOf(w.conversationId)).toHaveLength(1)
    expect(runnerFake.taskRunner.runTask).toHaveBeenCalledTimes(1)
  })

  it('keeps the next step the person authorised on the operation', async () => {
    await runTask({ taskId: w.taskId, then: 'Tell Sam what changed' })
    const [op] = await operationsOf(w.conversationId)
    expect(op.continuation).toEqual({ authorisedById: w.personId, authorisingTurnId: w.capability.turnId, nextStep: 'Tell Sam what changed', depth: 1 })
  })

  it('refuses a task already running elsewhere: that run is not this conversation\'s', async () => {
    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE' } })
    expect(await runTask({ taskId: w.taskId })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/already running/) })
    expect(await operationsOf(w.conversationId)).toEqual([])
  })

  it('is never held back by work agents already hold queued: there is no queue limit (adr-0175)', async () => {
    await fillQueue()
    await runTask({ taskId: w.taskId })
    expect(runnerFake.taskRunner.runTask).toHaveBeenCalledTimes(1)
  })

  it('refuses for a person who does not work in the project', async () => {
    const stranger = await createUserWithRole('MEMBER')
    const outcome = await runTask({ taskId: w.taskId }, { ...w.capability, actingUserId: stranger.id })
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/membership/) })
    expect(await operationsOf(w.conversationId)).toEqual([])
  })

  it('is not offered in a report turn, and refuses there', async () => {
    const report = { ...w.capability, trigger: 'REPORT' as const }
    expect(await runTaskTool.offered(report)).toBe(false)
    expect((await runTask({ taskId: w.taskId }, report)).status).toBe('refused')
  })

  it('ends its operation quietly and says why when the run could not start', async () => {
    runnerFake.taskRunner.runTask.mockImplementationOnce(async (taskId) => {
      await prisma.task.update({ where: { id: taskId }, data: { runState: 'RUN_FAILED', runStateReason: 'no Execution Site' } })
      return { outcome: 'failed', reason: 'no Execution Site' }
    })
    expect(await runTask({ taskId: w.taskId })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/did not start: no Execution Site/) })
    const [op] = await operationsOf(w.conversationId)
    expect(op).toMatchObject({ state: 'FAILED', noReport: true, error: 'no Execution Site' })
  })

  it('keeps its operation queued when the run is held for its site', async () => {
    runnerFake.taskRunner.runTask.mockResolvedValueOnce({ outcome: 'failed', reason: 'held' })
    expect((await runTask({ taskId: w.taskId })).status).toBe('accepted')
    expect((await operationsOf(w.conversationId))[0].state).toBe('QUEUED')
  })
})

describe('create_task in a turn @SC-969', () => {
  it("for now: creates the task in To do and starts it as the person's, an operation queued", async () => {
    const outcome = await createTask({ assignedAgentId: w.agentId, when: 'now' })
    expect(outcome.status).toBe('accepted')
    const [op] = await operationsOf(w.conversationId)
    expect(op).toMatchObject({ kind: 'TASK', state: 'QUEUED', toolName: 'create_task' })
    const task = await prisma.task.findUniqueOrThrow({ where: { id: op.taskId! } })
    expect(task).toMatchObject({ title: 'Write the release notes', state: 'TODO', runState: 'RUN_QUEUED', runStartedBy: 'person', onBehalfOfUserId: w.personId })
    expect(runnerFake.startedTasks).toMatchObject([{ taskId: task.id, startedBy: 'person', personId: w.personId }])
  })

  it('for later: names the column it was put in, and says when no agent is assigned', async () => {
    const outcome = await createTask({ when: 'later', state: 'TODO' })
    const note = (outcome as { result: { note: string } }).result.note
    expect(note).toMatch(/the .+ column/)
    expect(note).not.toContain('backlog')
    expect(note).toContain('No agent is assigned')
  })

  it('for later: creates the task in the backlog, unqueued, with no operation to follow, and says so', async () => {
    const outcome = await createTask({ assignedAgentId: w.agentId, when: 'later' })
    expect(outcome).toMatchObject({ status: 'done', result: { note: laterLine(undefined, true) } })
    const created = (outcome as { result: { taskId: string } }).result.taskId
    expect(await prisma.task.findUniqueOrThrow({ where: { id: created } })).toMatchObject({ state: 'BACKLOG', runState: 'RUN_NONE' })
    const ops = await operationsOf(w.conversationId)
    expect(ops.filter(o => o.kind === 'TASK')).toEqual([])
    // The quick call's own row, for the record: completed at once, never counted.
    expect(ops).toMatchObject([{ kind: 'TOOL', state: 'COMPLETED' }])
    expect(runnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it('for a time: creates the task with that start time, its operation completed as it is set', async () => {
    const outcome = await createTask({ assignedAgentId: w.agentId, when: '2099-01-05T09:00:00Z' })
    expect(outcome.status).toBe('accepted')
    const [op] = await operationsOf(w.conversationId)
    expect(op).toMatchObject({ kind: 'TASK', state: 'COMPLETED' })
    expect(op.completedAt).not.toBeNull()
    expect(setTaskStart(op)?.toISOString()).toBe('2099-01-05T09:00:00.000Z')
    const task = await prisma.task.findUniqueOrThrow({ where: { id: op.taskId! } })
    expect(task.scheduleAt?.toISOString()).toBe('2099-01-05T09:00:00.000Z')
    expect(task.runState).toBe('RUN_NONE')
    expect(runnerFake.taskRunner.runTask).not.toHaveBeenCalled()
    // Its run at that time is the task's own: no operation of this conversation takes it.
    expect(await attachStartedRun(op.taskId!, 'run-later', 'site-1')).toEqual([])
  })

  it('for a time: refuses something to follow it, creating nothing', async () => {
    const outcome = await createTask({ assignedAgentId: w.agentId, when: '2099-01-05T09:00:00Z', then: 'summarise it' })
    expect(outcome).toMatchObject({ status: 'refused', reason: NO_THEN_AT_A_TIME })
    expect(await prisma.task.count({ where: { title: 'Write the release notes' } })).toBe(0)
  })

  it('refuses a time that is not one, creating nothing', async () => {
    const outcome = await createTask({ assignedAgentId: w.agentId, when: 'next week sometime' })
    expect(outcome.status).toBe('refused')
    expect(await prisma.task.count({ where: { title: 'Write the release notes' } })).toBe(0)
  })

  it('refuses work for now with no agent to do it', async () => {
    expect(await createTask({ when: 'now' })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/assignedAgentId/) })
    expect(await prisma.task.count({ where: { title: 'Write the release notes' } })).toBe(0)
  })

  it('takes the project by its key or its name as well as its id', async () => {
    for (const projectId of [w.projectKey.toLowerCase(), 'Shop', 'the Shop project']) {
      const outcome = await createTask({ projectId, title: `Notes for ${projectId}`, when: 'later' })
      expect(outcome).toMatchObject({ status: 'done' })
      const created = (outcome as { result: { taskId: string } }).result.taskId
      expect(await prisma.task.findUniqueOrThrow({ where: { id: created } })).toMatchObject({ projectId: w.projectId })
    }
  })

  it('refuses words that name no project, creating nothing', async () => {
    expect(await createTask({ projectId: 'NOPE', when: 'later' })).toEqual({
      status: 'refused',
      reason: `there is no project with the key or name "NOPE"; list_projects shows each project's key and name`,
    })
    expect(await prisma.task.count({ where: { title: 'Write the release notes' } })).toBe(0)
  })

  it('for now, is never held back by work agents already hold queued: there is no queue limit (adr-0175)', async () => {
    await fillQueue()
    await createTask({ assignedAgentId: w.agentId, when: 'now' })
    expect(await prisma.task.count({ where: { title: 'Write the release notes' } })).toBe(1)
  })
})
