/**
 * Duplicate and out-of-order run events, against the real test database and the real mailbox (conversation layer
 * spec, Failure, recovery and observability: duplicate or out-of-order events are deduplicated; acceptance:
 * duplicate delivery never causes duplicate admission). A terminal frame delivered twice at once, a start after
 * the end, a request for approval delivered twice, and the conversation's listeners all taking one frame at once
 * end nothing twice and write one card. A late start of the task run that asked, after its approval queued the
 * task again, is not taken for the run the operation now waits for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../../test/db'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import * as siteStore from '../../../test/fakes/siteRuntimeStore'
import { markEndedRun } from '../../../server/controlplane/runResults'
import { readMessages } from '../../store/messages'
import { createStartWorkTool } from '../workers/startWork'
import { pump } from '../workers/queue'
import { handleWorkerRunStatus } from '../workers/runEvents'
import { NEVER_ABORTED, world } from '../workers/__tests__/workerFixtures'
import { runTaskTool } from '../tasks/runTaskTool'
import { handleTaskRunStatus } from '../tasks/runListener'
import { taskWorld } from '../tasks/__tests__/taskWorld'

const SITE = 'site-1'

function frame(runId: string, status: RunStatusEvent['status'], over: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return { runId, sessionId: 's', taskId: null, agentId: 'a', agentHandle: 'dev', status, error: null, sessionPatch: null, manifestPending: null, ...over }
}
const reload = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })
async function cards(conversationId: string, kind: 'RESULT' | 'APPROVAL_REQUEST') {
  return (await readMessages(conversationId, { limit: 50 })).filter(m => m.kind === kind)
}

describe("a worker's run @SC-966", () => {
  async function runningBrief() {
    const w = await world()
    const outcome = await createStartWorkTool({ moveOn: () => {} }).run(w.capability, { boundary: w.project.key, title: 'Profile', brief: 'Profile' }, NEVER_ABORTED)
    if (outcome.status !== 'accepted') throw new Error('not admitted')
    const op = await reload(outcome.operationId)
    await pump(op.workerSessionId!)
    siteStore.addRun(SITE, { id: 'run-1', sessionId: op.workerSessionId!, status: 'COMPLETED', outputText: 'Resize is slow.' })
    return { w, op }
  }
  const noMoveOn = () => {}

  it('ends once, with one card, when its end arrives twice at once and a start after it', async () => {
    const { w, op } = await runningBrief()
    const end = frame('run-1', 'COMPLETED')
    await Promise.all([handleWorkerRunStatus(end, SITE, noMoveOn), handleWorkerRunStatus(end, SITE, noMoveOn)])
    await handleWorkerRunStatus(frame('run-1', 'RUNNING'), SITE, noMoveOn)
    await handleWorkerRunStatus(frame('run-1', 'FAILED', { error: 'late' }), SITE, noMoveOn)

    expect(await reload(op.id)).toMatchObject({ state: 'COMPLETED', error: null })
    expect(await cards(w.conversation.id, 'RESULT')).toHaveLength(1)
  })

  it('asks once, with one card, when its request arrives twice at once', async () => {
    const { w, op } = await runningBrief()
    const asks = frame('run-1', 'COMPLETED', { manifestPending: { runId: 'run-1', summary: null, pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] } } })
    await Promise.all([handleWorkerRunStatus(asks, SITE, noMoveOn), handleWorkerRunStatus(asks, SITE, noMoveOn)])

    expect((await reload(op.id)).state).toBe('WAITING_FOR_APPROVAL')
    expect(await cards(w.conversation.id, 'APPROVAL_REQUEST')).toHaveLength(1)
    expect(await cards(w.conversation.id, 'RESULT')).toHaveLength(0)
  })

  it("ends once when the conversation's listeners all take its end at once", async () => {
    const { w, op } = await runningBrief()
    const end = { ...frame('run-1', 'COMPLETED'), sessionId: op.workerSessionId! }
    await Promise.all([
      handleWorkerRunStatus(end, SITE, noMoveOn),
      handleTaskRunStatus(end, SITE),
      markEndedRun(end, SITE),
      handleWorkerRunStatus(end, SITE, noMoveOn),
    ])
    expect((await reload(op.id)).state).toBe('COMPLETED')
    expect(await cards(w.conversation.id, 'RESULT')).toHaveLength(1)
  })
})

describe("a commissioned task's run @SC-966", () => {
  async function commissioned() {
    const w = await taskWorld()
    const outcome = await runTaskTool.run(w.capability, { taskId: w.taskId }, { signal: new AbortController().signal })
    const operationId = (outcome as { operationId: string }).operationId
    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE', runId: null } })
    const task = (over: Partial<RunStatusEvent> & { runId: string; status: RunStatusEvent['status'] }) =>
      frame(over.runId, over.status, { taskId: w.taskId, sessionId: 'task-session', ...over })
    return { w, operationId, task }
  }

  it('ends once, with one card, when its end arrives twice at once', async () => {
    const { w, operationId, task } = await commissioned()
    await handleTaskRunStatus(task({ runId: 'run-1', status: 'RUNNING' }), SITE)
    await prisma.task.update({ where: { id: w.taskId }, data: { runId: 'run-1' } })
    const end = task({ runId: 'run-1', status: 'COMPLETED' })
    await Promise.all([handleTaskRunStatus(end, SITE), handleTaskRunStatus(end, SITE)])
    await handleTaskRunStatus(task({ runId: 'run-1', status: 'RUNNING' }), SITE)

    expect((await reload(operationId)).state).toBe('COMPLETED')
    expect(await cards(w.conversationId, 'RESULT')).toHaveLength(1)
  })

  it('is not taken by a late start of the run that asked, once its approval queued the task again', async () => {
    const { w, operationId, task } = await commissioned()
    await handleTaskRunStatus(task({ runId: 'run-1', status: 'RUNNING' }), SITE)
    const asks = task({ runId: 'run-1', status: 'COMPLETED', manifestPending: { runId: 'run-1', summary: 'Needs the benchmark', pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] } } })
    await handleTaskRunStatus(asks, SITE)
    expect((await reload(operationId)).state).toBe('WAITING_FOR_APPROVAL')
    // Approved: the operation waits for the task's next run, and the task is queued again.
    await prisma.operation.update({ where: { id: operationId }, data: { state: 'QUEUED', runId: null } })
    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_QUEUED', runId: 'run-1' } })

    await handleTaskRunStatus(task({ runId: 'run-1', status: 'RUNNING' }), SITE)
    expect(await reload(operationId)).toMatchObject({ state: 'QUEUED', runId: null })

    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE', runId: null } })
    await handleTaskRunStatus(task({ runId: 'run-2', status: 'RUNNING' }), SITE)
    await prisma.task.update({ where: { id: w.taskId }, data: { runId: 'run-2' } })
    await handleTaskRunStatus(task({ runId: 'run-2', status: 'COMPLETED' }), SITE)
    expect(await reload(operationId)).toMatchObject({ state: 'COMPLETED', runId: 'run-2' })
    expect(await cards(w.conversationId, 'RESULT')).toHaveLength(1)
  })
})
