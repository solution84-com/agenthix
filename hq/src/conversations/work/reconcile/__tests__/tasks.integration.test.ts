/**
 * The task runs a conversation follows, reconciled with their task and their site, against the real test database
 * (conversation layer spec, Failure, recovery and observability): a run that ended while hq could not hear it ends
 * its operation once; one the site no longer has fails it; an operation still waiting for a run its task no longer
 * has coming — taken off the queue, or its start time cleared, on the board — ends cancelled, saying so; a run that
 * did start for it, unheard, is applied; work still to run is left alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import * as dispatchFake from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { runTaskTool } from '../../tasks/runTaskTool'
import { taskWorld, type TaskWorld } from '../../tasks/__tests__/taskWorld'
import { reconcileStrandedTaskOperations, reconcileTasksOn, TAKEN_OFF_QUEUE } from '../tasks'
import { RUN_NOT_ON_SITE } from '../workers'

const SITE = dispatchFake.DEFAULT_SITE_ID
let w: TaskWorld
let operationId: string
const reload = () => prisma.operation.findUniqueOrThrow({ where: { id: operationId } })
const setTask = (data: Record<string, unknown>) => prisma.task.update({ where: { id: w.taskId }, data })
/** A moment after every row these tests make. */
const later = () => new Date(Date.now() + 60_000)
/** A site run of the task, made after the operation. */
const siteRun = (id: string, over: Record<string, unknown> = {}) =>
  siteStore.addRun(SITE, { id, sessionId: 'task-session', taskId: w.taskId, createdAt: new Date(Date.now() + 1_000).toISOString(), ...over })

beforeEach(async () => {
  ended.length = 0
  w = await taskWorld()
  const outcome = await runTaskTool.run(w.capability, { taskId: w.taskId }, { signal: new AbortController().signal })
  operationId = (outcome as { operationId: string }).operationId
})

describe('an operation running on a run @SC-966', () => {
  beforeEach(async () => {
    await setTask({ runState: 'RUN_NONE', runId: 'run-1' })
    await prisma.operation.update({ where: { id: operationId }, data: { state: 'RUNNING', siteId: SITE, runId: 'run-1' } })
  })

  it('ends once with the run that ended unheard, however often it is reconciled', async () => {
    siteRun('run-1', { status: 'COMPLETED', outputText: 'Released.' })
    await Promise.all([reconcileTasksOn(SITE), reconcileTasksOn(SITE)])
    expect((await reload()).state).toBe('COMPLETED')
    expect(ended).toEqual([operationId])
  })

  it('fails, saying so, when the site no longer has the run', async () => {
    await reconcileTasksOn(SITE)
    expect(await reload()).toMatchObject({ state: 'FAILED', error: RUN_NOT_ON_SITE })
  })

  it('is left running while the run still runs', async () => {
    siteRun('run-1', { status: 'RUNNING' })
    await reconcileTasksOn(SITE)
    expect((await reload()).state).toBe('RUNNING')
  })
})

describe('an operation still waiting for its run @SC-966', () => {
  it('is left alone while its task is still queued', async () => {
    await setTask({ runState: 'RUN_QUEUED' })
    await reconcileTasksOn(SITE)
    expect(await reconcileStrandedTaskOperations(0, later())).toBe(0)
    expect((await reload()).state).toBe('QUEUED')
  })

  it('ends cancelled when its task was taken off the queue on its board, once quiet for long enough', async () => {
    await setTask({ runState: 'RUN_NONE', runId: null })
    expect(await reconcileStrandedTaskOperations(60_000)).toBe(0)
    expect((await reload()).state).toBe('QUEUED')
    expect(await reconcileStrandedTaskOperations(60_000, later())).toBe(1)
    expect(await reload()).toMatchObject({ state: 'CANCELLED', error: TAKEN_OFF_QUEUE })
    expect(ended).toEqual([operationId])
  })

  it('takes the run that started and ended for it unheard', async () => {
    await setTask({ runState: 'RUN_NONE', runId: 'run-7' })
    siteRun('run-7', { status: 'COMPLETED', outputText: 'Done it.' })
    await reconcileTasksOn(SITE)
    expect(await reload()).toMatchObject({ state: 'COMPLETED', runId: 'run-7' })
  })

  it("is not given a run from before it: that run was another's", async () => {
    await setTask({ runState: 'RUN_NONE', runId: 'run-old' })
    siteStore.addRun(SITE, { id: 'run-old', sessionId: 'task-session', taskId: w.taskId, status: 'COMPLETED', createdAt: new Date(0).toISOString() })
    await reconcileTasksOn(SITE)
    expect(await reload()).toMatchObject({ state: 'CANCELLED', error: TAKEN_OFF_QUEUE, runId: null })
  })

  it('attaches the run its task is running now', async () => {
    await setTask({ runState: 'RUN_ACTIVE', runId: 'run-3' })
    siteRun('run-3', { status: 'RUNNING' })
    await reconcileTasksOn(SITE)
    expect(await reload()).toMatchObject({ state: 'RUNNING', runId: 'run-3' })
  })

  it('leaves a task set for a time alone: setting it completed its operation', async () => {
    await prisma.operation.update({ where: { id: operationId }, data: { state: 'COMPLETED' } })
    await setTask({ runState: 'RUN_NONE', runId: null, scheduleAt: later() })
    await reconcileTasksOn(SITE)
    expect((await reload()).state).toBe('COMPLETED')
  })
})
