/**
 * The owner of TASK operations (conversation layer spec, Stopping; Approval). A task is the project's, not the
 * conversation's: Stop detaches the operation and leaves the task and its run as they are, with no report turn —
 * except in the task's own thread, where work is a run of the task and Stop stops that run, as the task's Stop
 * does (the overview's task-thread rules, 6). An answer to a task run's request is today's answer on the task's
 * card, given as the person who answered.
 */
import { HttpError, prisma } from 'wasp/server'
import type { OperationOwner } from '../../contract'
import { settleOperation } from '../../coordinator/mailbox'
import { approveRequest, rejectRequest } from '../../../agents/manifestActions'
import { stopTask } from '../../../projects/stopTask'

export const DETACHED_LINE = 'Stopped following it here; the task carries on as it is.'
export const STOPPED_LINE = 'Stopped.'

/** The task, when the operation runs it from the task's own thread: Stop is then the task's Stop. */
async function ownThreadTask(operationId: string): Promise<string | null> {
  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    select: { taskId: true, conversation: { select: { home: true, taskId: true } } },
  })
  return op?.taskId && op.conversation.home === 'TASK' && op.conversation.taskId === op.taskId ? op.taskId : null
}

export const taskOwner: OperationOwner = {
  async cancel(operationId, byUserId) {
    const taskId = await ownThreadTask(operationId)
    if (taskId) {
      try {
        await stopTask({ taskId }, { user: { id: byUserId } } as Parameters<typeof stopTask>[1])
      } catch (err) {
        // A task already deleted has no run left to stop.
        if (!(err instanceof HttpError && err.statusCode === 404)) throw err
      }
      await settleOperation(operationId, { state: 'CANCELLED', noReport: true, result: { summary: STOPPED_LINE } })
      return
    }
    await settleOperation(operationId, { state: 'DETACHED', noReport: true, result: { summary: DETACHED_LINE } })
  },

  async answerApproval(operationId, answer, note, byUserId) {
    const op = await prisma.operation.findUnique({ where: { id: operationId }, select: { kind: true, state: true, runId: true } })
    if (!op || op.kind !== 'TASK' || op.state !== 'WAITING_FOR_APPROVAL' || !op.runId) {
      throw new Error('This work is not waiting for an approval')
    }
    if (answer === 'approve') {
      await approveRequest({ runId: op.runId }, byUserId)
      return
    }
    // Answered here, the lead takes its turn on the answer itself, so the operation's end needs no report of its own.
    await prisma.operation.updateMany({ where: { id: operationId, state: 'WAITING_FOR_APPROVAL' }, data: { noReport: true } })
    try {
      await rejectRequest({ runId: op.runId, reason: note?.trim() || 'Declined in the conversation' }, byUserId)
    } catch (err) {
      await prisma.operation.updateMany({ where: { id: operationId, state: 'WAITING_FOR_APPROVAL' }, data: { noReport: false } })
      throw err
    }
  },
}
