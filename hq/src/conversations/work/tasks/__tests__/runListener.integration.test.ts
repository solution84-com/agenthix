/**
 * A task run's events into the operations a conversation commissioned it for (workers and results spec, Results),
 * against the real test database: the run's start attaches it; its end completes them with the result it stated —
 * or, stating none, its last words marked as not stated — and the task's column after it; a request for approval
 * leaves them waiting and tells the mailbox; a pause queues them again. Runs nobody here asked for, and frames from
 * a site that does not hold the task, change nothing. Stop detaches the operation and leaves the task as it is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { runPausedReason } from '@agenthix/core'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../../../server/dashboard/debouncedPush', () => import('../../../../test/fakes/debouncedPush'))
vi.mock('../../../../agents/TaskRunner', () => import('../../../../test/fakes/TaskRunner'))
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
const told = vi.hoisted(() => ({ ended: [] as string[], asked: [] as Array<{ operationId: string; request: unknown }> }))
vi.mock('../../../coordinator/mailbox', async () => {
  const { createSettleOperation } = await import('../../settle')
  const mailbox = {
    operationSettled() {},
    async operationEnded(id: string) { told.ended.push(id) },
    async approvalRequested(operationId: string, request: unknown) { told.asked.push({ operationId, request }) },
  }
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as dispatchFake from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { openJson } from '../../../sealing'
import { recordStatedResult } from '../../../../server/controlplane/runResults'
import { runTaskTool } from '../runTaskTool'
import { handleTaskRunStatus } from '../runListener'
import { taskOwner } from '../owner'
import { NO_RESULT_LINE } from '../runEnd'
import { operationsOf, taskWorld, type TaskWorld } from './taskWorld'

const SITE = dispatchFake.DEFAULT_SITE_ID
let w: TaskWorld
let operationId: string

function frame(overrides: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 'task-session', taskId: w.taskId, agentId: w.agentId, agentHandle: 'dev', status: 'RUNNING',
    error: null, sessionPatch: null, manifestPending: null, ...overrides,
  }
}

const operation = () => prisma.operation.findUniqueOrThrow({ where: { id: operationId } })

beforeEach(async () => {
  told.ended.length = 0
  told.asked.length = 0
  w = await taskWorld()
  const outcome = await runTaskTool.run(w.capability, { taskId: w.taskId }, { signal: new AbortController().signal })
  operationId = (outcome as { operationId: string }).operationId
  // Claimed, as the task runner (faked here) claims it before its run starts: the run's start is the task's run.
  await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE', runId: null } })
})

describe("a commissioned run's start @SC-970", () => {
  it('attaches the run to the operation, which is now running', async () => {
    await handleTaskRunStatus(frame(), SITE)
    expect(await operation()).toMatchObject({ state: 'RUNNING', runId: 'run-1', siteId: SITE })
  })

  it('changes nothing when it comes from a site that does not hold the task', async () => {
    await handleTaskRunStatus(frame(), 'another-site')
    expect(await operation()).toMatchObject({ state: 'QUEUED', runId: null })
  })
})

describe("a commissioned run's end @SC-970", () => {
  beforeEach(async () => {
    await handleTaskRunStatus(frame(), SITE)
    await prisma.task.update({ where: { id: w.taskId }, data: { column: 'release', runId: 'run-1' } })
  })

  it("completes the operation with the result the run stated and the task's column after it", async () => {
    await recordStatedResult({ runId: 'run-1', siteId: SITE, sessionId: 'task-session', taskId: w.taskId, result: 'Released 1.2' })
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    const op = await operation()
    expect(op.state).toBe('COMPLETED')
    expect(openJson(op.resultSummary!)).toEqual({ summary: 'Released 1.2', stated: true, taskState: 'Release', runId: 'run-1' })
    expect(told.ended).toEqual([operationId])
  })

  it('completes it with the run\'s last words, marked not stated, when the run stated no result', async () => {
    siteStore.addRun(SITE, { id: 'run-1', sessionId: 'task-session', taskId: w.taskId, outputText: 'I moved it to Release.' })
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect(openJson((await operation()).resultSummary!)).toEqual({ summary: 'I moved it to Release.', stated: false, taskState: 'Release', runId: 'run-1' })
  })

  it('says the run said nothing when there are no last words either', async () => {
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect(openJson<{ summary: string }>((await operation()).resultSummary!).summary).toBe(NO_RESULT_LINE)
  })

  it('fails it with the run\'s error', async () => {
    await handleTaskRunStatus(frame({ status: 'FAILED', error: 'The run ran out of memory' }), SITE)
    expect(await operation()).toMatchObject({ state: 'FAILED', error: 'The run ran out of memory' })
  })

  it('ends it once, however often the end arrives', async () => {
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect(told.ended).toEqual([operationId])
  })

  it('leaves it waiting for approval when the run asked, and tells the mailbox what and why', async () => {
    const manifestPending = { runId: 'run-1', summary: 'To measure the resize step', pendingManifest: { tools: [{ name: 'benchmark' }], bashPatterns: [] } }
    await handleTaskRunStatus(frame({ status: 'COMPLETED', manifestPending }), SITE)
    expect(await operation()).toMatchObject({ state: 'WAITING_FOR_APPROVAL', runId: 'run-1' })
    expect(told.asked).toEqual([{ operationId, request: { runId: 'run-1', reason: 'To measure the resize step', what: 'Use benchmark' } }])
    expect(told.ended).toEqual([])
  })

  it('queues it again when the run was paused for a scheduled change, ready for the run after it', async () => {
    await handleTaskRunStatus(frame({ status: 'CANCELLED', error: runPausedReason(null) }), SITE)
    expect(await operation()).toMatchObject({ state: 'QUEUED', runId: null })
    // The task runs again: claimed for its next run, which starts.
    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE', runId: null } })
    await handleTaskRunStatus(frame({ runId: 'run-2' }), SITE)
    expect(await operation()).toMatchObject({ state: 'RUNNING', runId: 'run-2' })
  })
})

describe('an end that arrives with no start before it @SC-970', () => {
  it('still completes the operation, when the task records the run as its own', async () => {
    await prisma.task.update({ where: { id: w.taskId }, data: { runId: 'run-9' } })
    await handleTaskRunStatus(frame({ runId: 'run-9', status: 'COMPLETED' }), SITE)
    expect(await operation()).toMatchObject({ state: 'COMPLETED', runId: 'run-9' })
  })

  it('is not the operation\'s when the task records another run', async () => {
    await prisma.task.update({ where: { id: w.taskId }, data: { runId: 'run-8' } })
    await handleTaskRunStatus(frame({ runId: 'run-9', status: 'COMPLETED' }), SITE)
    expect(await operation()).toMatchObject({ state: 'QUEUED', runId: null })
  })
})

describe('a run of a task no conversation asked for @SC-970', () => {
  it('is no operation of any conversation', async () => {
    await prisma.operation.deleteMany({})
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect(await operationsOf(w.conversationId)).toEqual([])
    expect(told.ended).toEqual([])
  })
})

describe('Stop on a task operation @SC-965', () => {
  it('detaches it with no report, and leaves the task as it is', async () => {
    await handleTaskRunStatus(frame(), SITE)
    const before = await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })
    await taskOwner.cancel(operationId, w.personId)
    expect(await operation()).toMatchObject({ state: 'DETACHED', noReport: true })
    const after = await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })
    expect(after.runState).toBe(before.runState)
    expect(siteStore.cancelledRuns).toEqual([])
    // The run's end later is the task's alone.
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect((await operation()).state).toBe('DETACHED')
  })
})
