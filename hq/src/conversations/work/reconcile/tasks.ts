/**
 * The task runs a conversation commissioned, after hq could not hear their site (conversation layer spec, Failure,
 * recovery and observability). Each outstanding TASK operation is read against the task and the run the site
 * holds, and what the run says is applied through the same path the listener takes (tasks/runListener.ts):
 *
 * - Running on a run: the run's end, or its request for approval, is applied; a run the site no longer has ends
 *   the operation as failed.
 * - Waiting for its run (queued): while the task is still queued or running there is nothing to do, or only to
 *   attach the run it is running. Once the task is neither, the run it last had is read: started after the
 *   operation, it was this operation's run, ended unheard, and is applied; otherwise the task was taken off the
 *   queue on its board before it ran, and the operation ends cancelled, saying so.
 * - A task set for a time has no operation to reconcile: setting it completed it (walkthrough finding 33).
 * - Waiting for approval: a person answers it; nothing to reconcile.
 */
import { prisma } from 'wasp/server'
import type { RunRow, RunStatusEvent } from '@agenthix/core'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { resolveSiteIdForTask } from '../../../agents/dispatchService'
import { settleOperation } from '../../coordinator/mailbox'
import { Logger } from '../../../server/utils/logger'
import { handleTaskRunStatus } from '../tasks/runListener'
import { RUN_NOT_ON_SITE } from './workers'
import { eachOperation } from './each'

const logger = new Logger('ConversationReconcile')

export const TAKEN_OFF_QUEUE = 'The task was taken off the queue on its board before it ran.'

/** The task states in which an operation waiting for its run is still waiting for it. */
const STILL_TO_RUN = ['RUN_QUEUED'] as const

type TaskOp = { id: string; state: string; siteId: string | null; runId: string | null; taskId: string | null; createdAt: Date }

/** A run as the site holds it, read as the frame it would have sent. */
export function statusOfRun(run: RunRow): RunStatusEvent {
  const status = run.status === 'PENDING' ? 'RUNNING' : run.status
  const going = status === 'RUNNING'
  return {
    runId: run.id,
    sessionId: run.sessionId,
    taskId: run.taskId,
    agentId: run.agentId,
    agentHandle: '',
    status,
    error: going ? null : run.error,
    sessionPatch: null,
    manifestPending: !going && run.manifestStatus === 'PENDING_APPROVAL'
      ? { runId: run.id, summary: null, pendingManifest: run.pendingManifest }
      : null,
  }
}

async function followRun(op: TaskOp, siteId: string, runId: string): Promise<void> {
  const run = await siteRuntimeStore.getRun(siteId, runId)
  if (!run) {
    await settleOperation(op.id, { state: 'FAILED', error: RUN_NOT_ON_SITE })
    return
  }
  await handleTaskRunStatus({ ...statusOfRun(run), taskId: op.taskId }, siteId)
}

async function waitingForRun(op: TaskOp & { taskId: string }, siteId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: op.taskId }, select: { runState: true, runId: true } })
  if (!task) return
  if ((STILL_TO_RUN as readonly string[]).includes(task.runState)) return
  if (task.runId) {
    const run = await siteRuntimeStore.getRun(siteId, task.runId)
    // A run started for it: the run's start or end, unheard, is applied. One from before it is another's.
    if (run && new Date(run.createdAt) >= op.createdAt) return handleTaskRunStatus({ ...statusOfRun(run), taskId: op.taskId }, siteId)
  }
  // Claimed and being started: its run is not recorded yet, and its start will attach it.
  if (task.runState === 'RUN_ACTIVE') return
  await settleOperation(op.id, { state: 'CANCELLED', error: TAKEN_OFF_QUEUE })
}

/** One outstanding TASK operation, read against its task and its site. */
export async function reconcileTaskOperation(op: TaskOp, siteId: string): Promise<void> {
  if (!op.taskId || op.state === 'WAITING_FOR_APPROVAL') return
  if (op.runId && op.siteId === siteId) return followRun(op, siteId, op.runId)
  if (op.runId) return
  await waitingForRun({ ...op, taskId: op.taskId }, siteId)
}

const SELECT = { id: true, state: true, siteId: true, runId: true, taskId: true, createdAt: true } as const

/** Every outstanding TASK operation whose task runs on this site. */
export async function reconcileTasksOn(siteId: string): Promise<void> {
  const ops = await prisma.operation.findMany({
    where: { kind: 'TASK', state: { in: ['RUNNING', 'UNCERTAIN', 'ACCEPTED', 'QUEUED'] } },
    select: SELECT,
    orderBy: { createdAt: 'asc' },
  })
  await eachOperation(ops, async (op) => {
    if (!op.taskId || (await resolveSiteIdForTask(op.taskId).catch(() => null)) !== siteId) return
    await reconcileTaskOperation(op, siteId)
  })
}

/**
 * TASK operations still waiting for a run their task no longer has coming — a person took it off the queue, or
 * cleared its start time, on its board — found without waiting for a site to reconnect. Only those unchanged for
 * `quietFor`, so a frame being handled now is left to its listener. Returns how many were read.
 */
export async function reconcileStrandedTaskOperations(quietFor: number, now = new Date()): Promise<number> {
  const ops = await prisma.operation.findMany({
    where: {
      kind: 'TASK',
      state: { in: ['ACCEPTED', 'QUEUED'] },
      runId: null,
      updatedAt: { lt: new Date(now.getTime() - quietFor) },
      taskId: { not: null },
    },
    select: SELECT,
  })
  let read = 0
  for (const op of ops) {
    const task = await prisma.task.findUnique({ where: { id: op.taskId! }, select: { runState: true } })
    if (!task || (STILL_TO_RUN as readonly string[]).includes(task.runState) || task.runState === 'RUN_ACTIVE') continue
    const siteId = await resolveSiteIdForTask(op.taskId!).catch(() => null)
    if (!siteId) continue
    try {
      await reconcileTaskOperation(op, siteId)
      read++
    } catch (err) {
      // Its site is down: it is read again when the site connects.
      logger.warn(`could not reconcile task operation ${op.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return read
}
