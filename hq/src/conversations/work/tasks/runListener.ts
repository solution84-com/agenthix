/**
 * A task run's events into the operations a conversation commissioned it for (workers and results spec, Results):
 * its start attaches the run to them, its end completes them with the run's result and the task's state after it,
 * and its request for approval leaves them waiting for an answer, presented in the conversation. Runs of a task
 * no conversation asked for are not any conversation's operations; when the task has a thread, their end is a
 * card there all the same (taskThread/runCards.ts).
 */
import { prisma } from 'wasp/server'
import { TASK_STATE_LABELS, type RunStatusEvent } from '@agenthix/core'
import { onRunStatus } from '../../../sites/channel/siteEventHandler'
import { resolveSiteIdForTask } from '../../../agents/dispatchService'
import { thisRunIsCurrent } from '../../../agents/taskStatusListener'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { readRunResult } from '../../../server/controlplane/runResults'
import { Logger } from '../../../server/utils/logger'
import { OUTSTANDING_OPERATION_STATES } from '../../../shared/conversations/protocol'
import { mailbox, settleOperation } from '../../coordinator/mailbox'
import { announce, attachStartedRun, moveOperation, operationsOfRun } from './taskOperations'
import { resultOf, runEndForOperation } from './runEnd'
import { endedStateOf, taskRunEndedInThread } from '../../taskThread/runCards'

const logger = new Logger('ConversationTasks')

/** The task's column after the run, as its type names it: "Release", or "Backlog". */
async function taskStateOf(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { state: true, typeColumn: { select: { name: true } } } })
  if (!task) return null
  return task.typeColumn?.name ?? TASK_STATE_LABELS[task.state]
}

async function lastWordsOf(siteId: string, runId: string): Promise<string | null> {
  try {
    return (await siteRuntimeStore.getRun(siteId, runId))?.outputText ?? null
  } catch {
    // The site went away after sending the end: the summary says the run stated nothing.
    return null
  }
}

async function runStarted(taskId: string, e: RunStatusEvent, siteId: string): Promise<void> {
  // Only the task's current run: the late start of one that has ended — the run that asked, before its approval
  // queued the task again — is not the run its operations now wait for.
  if ((await prisma.task.count({ where: { id: taskId, ...thisRunIsCurrent(e.runId) } })) === 0) return
  for (const operationId of await attachStartedRun(taskId, e.runId, siteId)) await announce(operationId)
}

async function runEnded(taskId: string, e: RunStatusEvent, siteId: string): Promise<void> {
  // The end can arrive with no start before it (a lost frame, a very short run): when the task records this run
  // as its own, the operations still waiting for a run were waiting for this one.
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { runId: true } })
  if (task?.runId === e.runId) await attachStartedRun(taskId, e.runId, siteId)
  const operations = await operationsOfRun(taskId, e.runId)
  if (operations.length === 0) return
  const stated = await readRunResult(e.runId)
  const lastWords = stated?.stated ? null : await lastWordsOf(siteId, e.runId)
  const outcome = runEndForOperation(e, resultOf(stated, lastWords, await taskStateOf(taskId), e.runId))

  for (const { id } of operations) {
    if (outcome.kind === 'ended') {
      await settleOperation(id, outcome.end)
    } else if (outcome.kind === 'queuedAgain') {
      if (await moveOperation(id, ['RUNNING', 'UNCERTAIN'], { state: 'QUEUED', runId: null })) await announce(id)
    } else if (await moveOperation(id, ['RUNNING', 'UNCERTAIN'], { state: 'WAITING_FOR_APPROVAL' })) {
      await mailbox.approvalRequested(id, { runId: e.runId, reason: outcome.reason, what: outcome.what })
    }
  }
}

/** The end of any run of a task that has a thread: a card there unless the thread commissioned it. */
async function runEndedForThread(taskId: string, e: RunStatusEvent, siteId: string): Promise<void> {
  const state = endedStateOf(e)
  if (!state) return
  const stated = await readRunResult(e.runId)
  const lastWords = stated?.stated ? null : await lastWordsOf(siteId, e.runId)
  const result = resultOf(stated, lastWords, await taskStateOf(taskId), e.runId)
  await taskRunEndedInThread({ taskId, runId: e.runId, state, result, error: e.error ?? null })
}

export async function handleTaskRunStatus(e: RunStatusEvent, siteId: string): Promise<void> {
  const taskId = e.taskId
  if (!taskId) return
  const any = await prisma.operation.count({ where: { kind: 'TASK', taskId, state: { in: [...OUTSTANDING_OPERATION_STATES] } } })
  const thread = await prisma.conversation.count({ where: { taskId, status: { not: 'CLOSED' } } })
  if (any === 0 && thread === 0) return
  // A frame must come from the site that holds the task, or it could start or end another's work.
  if ((await resolveSiteIdForTask(taskId)) !== siteId) return

  if (e.status === 'RUNNING' && !e.manifestPending) {
    if (any > 0) await runStarted(taskId, e, siteId)
    return
  }
  if (any > 0) await runEnded(taskId, e, siteId)
  if (thread > 0) await runEndedForThread(taskId, e, siteId)
}

export function registerTaskOperationListener(): void {
  onRunStatus('conversation-task-operations', async (e, siteId) => {
    await handleTaskRunStatus(e, siteId).catch(err => logger.error(`could not follow run ${e.runId} of task ${e.taskId}`, err))
  })
}
