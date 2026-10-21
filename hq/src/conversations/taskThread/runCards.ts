/**
 * Every run of a task is a card and a report turn in its thread (the overview's task-thread rules, 6), so the
 * thread is the task's running story — the pulse's run, a scheduled one, one started from the board. A run the
 * thread commissioned already comes back through its operation (work/tasks/runListener.ts); any other run's end
 * is written here as a completion card with no operation, so the activity indicator does not count it.
 */
import type { RunStatusEvent } from '@agenthix/core'
import { isRunPausedReason } from '@agenthix/core'
import { prisma } from 'wasp/server'
import type { ResultBody } from '../../shared/conversations/protocol'
import { appendMessageIn } from '../store/messages'
import { conversationEvents } from '../coordinator/events'
import { scheduleConversation } from '../coordinator/scheduler'
import { resultBodyOf, type EndedState } from '../coordinator/cards'
import type { OperationResult } from '../../shared/conversations/protocol'

/** How the run ended, as a card says it; null for a frame that is not an end (a start, a request, a pause). */
export function endedStateOf(e: Pick<RunStatusEvent, 'status' | 'error' | 'manifestPending'>): EndedState | null {
  if (e.manifestPending) return null
  if (e.status === 'COMPLETED') return 'COMPLETED'
  if (e.status === 'FAILED') return 'FAILED'
  if (e.status === 'CANCELLED') return isRunPausedReason(e.error) ? null : 'CANCELLED'
  return null
}

export function runCardBody(input: {
  taskKey: string
  title: string
  taskId: string
  state: EndedState
  result: OperationResult
  error: string | null
}): ResultBody {
  return resultBodyOf({
    title: `${input.taskKey} ${input.title}`,
    state: input.state,
    result: input.result,
    error: input.state === 'FAILED' ? input.error?.trim() || 'The run failed' : input.error,
    task: { id: input.taskId, key: input.taskKey },
  })
}

export interface RunEnd {
  taskId: string
  runId: string
  state: EndedState
  result: OperationResult
  error: string | null
}

/**
 * Writes the end of a run the task's thread did not commission into the thread, once per run, awaiting a report
 * turn — unless the thread is closed, or the thread commissioned the run itself.
 */
export async function taskRunEndedInThread(end: RunEnd): Promise<void> {
  const thread = await prisma.conversation.findUnique({ where: { taskId: end.taskId }, select: { id: true, status: true } })
  if (!thread || thread.status === 'CLOSED') return
  const commissioned = await prisma.operation.count({ where: { conversationId: thread.id, kind: 'TASK', runId: end.runId } })
  if (commissioned > 0) return
  const task = await prisma.task.findUnique({
    where: { id: end.taskId },
    select: { title: true, number: true, project: { select: { key: true } } },
  })
  if (!task) return
  const body = runCardBody({
    taskKey: `${task.project.key}-${task.number}`, title: task.title, taskId: end.taskId, state: end.state, result: end.result, error: end.error,
  })
  const { message, duplicate } = await prisma.$transaction(async (tx) => {
    const written = await appendMessageIn(tx, {
      conversationId: thread.id, role: 'PLATFORM', kind: 'RESULT', body, clientMessageId: `run:${end.runId}`,
    })
    if (!written.duplicate) await tx.conversationMessage.update({ where: { id: written.message.id }, data: { awaitsTurn: true } })
    return written
  })
  if (duplicate) return
  conversationEvents.message(thread.id, message)
  scheduleConversation(thread.id)
}
