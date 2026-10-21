/**
 * A worker's run events into its operation (conversation layer spec, Background operation; Approval): running,
 * ended — completed with its result summary, failed with why, cancelled — or asking for approval, which ends the
 * run and leaves the operation waiting. The operation is found by its run, on the site that holds it; a frame for
 * a run no operation names now (a run before an approval, a frame from another site) changes nothing.
 *
 * Duplicates and late frames end nothing twice: every move is conditional on the state it moves from, and an end
 * goes through settleOperation, which ends an operation once.
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import { OUTSTANDING_OPERATION_STATES, type OperationStateValue } from '../../../shared/conversations/protocol'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { Logger } from '../../../server/utils/logger'
import { mailbox, settleOperation } from '../../coordinator/mailbox'
import { requestedWhat, requestReason, workerResult, type WorkerFrame } from './runReads'
import { announce } from '../tasks/taskOperations'

const logger = new Logger('WorkerRunEvents')

/** What became of the operation, for the caller to move the worker's queue on. */
export type FrameOutcome = { operationId: string; workerSessionId: string | null } | null

async function readRun(siteId: string, runId: string): Promise<RunRow | null> {
  try {
    return await siteRuntimeStore.getRun(siteId, runId)
  } catch (err) {
    logger.warn(`could not read run ${runId} on site ${siteId}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** Tells the screens a worker's row moved on without ending: the sheet then reads its state again. Best effort. */
export async function announceMove(operationId: string): Promise<void> {
  await announce(operationId).catch(err => logger.warn(`could not announce operation ${operationId}: ${err instanceof Error ? err.message : String(err)}`))
}

async function moveToWaiting(op: { id: string }, frame: WorkerFrame, siteId: string): Promise<void> {
  const { count } = await prisma.operation.updateMany({
    where: { id: op.id, runId: frame.runId, state: { in: ['ACCEPTED', 'RUNNING'] } },
    data: { state: 'WAITING_FOR_APPROVAL' },
  })
  if (count === 0) return
  const run = await readRun(siteId, frame.runId)
  const request = frame.manifestPending?.pendingManifest ?? run?.pendingManifest
  await mailbox.approvalRequested(op.id, { runId: frame.runId, reason: requestReason(run?.outputText ?? null, request), what: requestedWhat(request) })
}

async function completedResult(siteId: string, runId: string) {
  const [stated, run] = await Promise.all([
    prisma.runResult.findUnique({ where: { runId }, select: { result: true, stated: true } }),
    readRun(siteId, runId),
  ])
  return workerResult(runId, stated, run?.outputText ?? null)
}

/** Applies one frame of a worker's run to its operation. */
export async function applyWorkerFrame(frame: WorkerFrame, siteId: string): Promise<FrameOutcome> {
  const op = await prisma.operation.findFirst({
    where: { kind: 'WORKER', siteId, runId: frame.runId },
    select: { id: true, state: true, noReport: true, workerSessionId: true },
  })
  if (!op || !(OUTSTANDING_OPERATION_STATES as readonly OperationStateValue[]).includes(op.state)) return null
  const outcome: FrameOutcome = { operationId: op.id, workerSessionId: op.workerSessionId }

  if (frame.manifestPending) {
    await moveToWaiting(op, frame, siteId)
    return outcome
  }
  if (frame.status === 'RUNNING') {
    const { count } = await prisma.operation.updateMany({ where: { id: op.id, runId: frame.runId, state: { in: ['ACCEPTED', 'QUEUED'] } }, data: { state: 'RUNNING' } })
    if (count === 1) await announceMove(op.id)
    return outcome
  }
  // A run that asked for approval has ended; only its being stopped or declined ends the operation now.
  if (op.state === 'WAITING_FOR_APPROVAL' && frame.status !== 'CANCELLED') return outcome

  if (frame.status === 'COMPLETED') {
    await settleOperation(op.id, { state: 'COMPLETED', result: await completedResult(siteId, frame.runId) })
  } else if (frame.status === 'FAILED') {
    await settleOperation(op.id, { state: 'FAILED', error: frame.error?.trim() || 'The work stopped with an error.' })
  } else {
    await settleOperation(op.id, { state: 'CANCELLED', noReport: op.noReport })
  }
  return outcome
}
