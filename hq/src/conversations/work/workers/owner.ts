/**
 * The owner of WORKER operations: Stop and the answer to a worker's approval request (conversation layer spec,
 * Approval; Conversation activity, Stopping). The caller has already checked that the person may; this carries
 * it out at the site.
 *
 * Stop: a queued brief ends at once; a running one is stopped on its site and ends when the site says so; one
 * waiting for approval is declined and ends. None of them gets a report turn: the person stopped it.
 *
 * Approve: the request is approved on the site and the worker continues in a new run of the same session, the
 * operation following it. Decline: the request is declined on the site and the worker is told in a new run, which
 * finishes as the worker decides; its result is the operation's completion, and the one reply that presents it, so
 * the worker is asked to end with its whole result. Either way the operation is first moved off the run that asked
 * (ACCEPTED, no run), so that run's own late frames change nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { personName } from '../../../sessions/transcriptAuthors'
import { CONTINUE_AFTER_APPROVAL, REPLACED_REQUEST_REFUSAL, continueAfterDenial } from '../../../agents/manifestRequests'
import type { OperationOwner } from '../../contract'
import { settleOperation } from '../../coordinator/mailbox'
import { dispatchAccepted, schedulePump } from './queue'
import { RESTATE_RESULT, continueAfterApprovalText } from './runReads'
import { announceMove } from './frames'

export const NOT_WAITING = 'This work is not waiting for an answer.'

async function workerOperation(operationId: string) {
  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    select: { id: true, kind: true, state: true, siteId: true, runId: true, workerSessionId: true },
  })
  if (!op || op.kind !== 'WORKER') throw new HttpError(404, 'That work was not found')
  return op
}

async function stop(operationId: string, byUserId: string): Promise<void> {
  const op = await workerOperation(operationId)
  switch (op.state) {
    case 'QUEUED':
    case 'ACCEPTED':
      // Not yet a run (or being started: the run that starts is stopped as it is recorded).
      await settleOperation(op.id, { state: 'CANCELLED', noReport: true })
      break
    case 'RUNNING':
    case 'UNCERTAIN':
      if (!op.siteId || !op.runId) {
        await settleOperation(op.id, { state: 'CANCELLED', noReport: true })
        break
      }
      // Ends when the site's CANCELLED frame comes, with no report turn.
      await prisma.operation.update({ where: { id: op.id }, data: { noReport: true } })
      await siteRuntimeStore.cancelRun(op.siteId, op.runId, undefined, await personName(byUserId))
      return
    case 'WAITING_FOR_APPROVAL':
      if (op.siteId && op.runId) await siteRuntimeStore.rejectRun(op.siteId, op.runId, 'Stopped', byUserId)
      await settleOperation(op.id, { state: 'CANCELLED', noReport: true })
      break
    default:
      return
  }
  schedulePump(op.workerSessionId)
}

/** Moves a waiting operation off the run that asked; false when someone else answered it first. */
async function takeAnswer(operationId: string): Promise<boolean> {
  const { count } = await prisma.operation.updateMany({
    where: { id: operationId, state: 'WAITING_FOR_APPROVAL' },
    data: { state: 'ACCEPTED', runId: null },
  })
  return count === 1
}

/** Puts it back as it was when the site could not be told. */
async function giveBack(operationId: string, runId: string): Promise<void> {
  await prisma.operation.updateMany({ where: { id: operationId, state: 'ACCEPTED', runId: null }, data: { state: 'WAITING_FOR_APPROVAL', runId } })
}

async function answerApproval(operationId: string, answer: 'approve' | 'decline', note: string | null, byUserId: string): Promise<void> {
  const op = await workerOperation(operationId)
  if (op.state !== 'WAITING_FOR_APPROVAL' || !op.siteId || !op.runId) throw new HttpError(409, NOT_WAITING)
  const { siteId, runId } = op
  if (!(await takeAnswer(op.id))) throw new HttpError(409, NOT_WAITING)

  let input: string
  try {
    if (answer === 'approve') {
      const { approved } = await siteRuntimeStore.approveRun(siteId, runId, byUserId)
      if (!approved) {
        // Replaced on the site by something newer: it can never be answered, so it ends here.
        await settleOperation(op.id, { state: 'FAILED', error: REPLACED_REQUEST_REFUSAL })
        schedulePump(op.workerSessionId)
        throw new HttpError(409, REPLACED_REQUEST_REFUSAL)
      }
      input = continueAfterApprovalText(note, CONTINUE_AFTER_APPROVAL)
    } else {
      const run = await siteRuntimeStore.getRun(siteId, runId)
      await siteRuntimeStore.rejectRun(siteId, runId, note?.trim() || undefined, byUserId)
      input = continueAfterDenial(run?.pendingManifest, note?.trim() || null)
    }
  } catch (err) {
    if (!(err instanceof HttpError)) await giveBack(op.id, runId)
    throw err
  }
  const text = `${input}\n\n${RESTATE_RESULT}`
  if (!(await dispatchAccepted(op.id, { text, hidden: true, senderId: byUserId }))) {
    schedulePump(op.workerSessionId)
    return
  }
  // Answered and running again: the row no longer reads as waiting for approval.
  await announceMove(op.id)
}

export const workerOwner: OperationOwner = { cancel: stop, answerApproval }
