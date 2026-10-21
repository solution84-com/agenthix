/**
 * A standing worker's briefs after hq could not hear their site (conversation layer spec, Failure, recovery and
 * observability: operation events recover; duplicate or out-of-order events are reconciled against the
 * authoritative status). A frame lost while hq was down, or while the site's channel was down, must not leave an
 * operation running for ever, so when a site connects each outstanding brief there is read against the run the
 * site holds, and what the run says is applied through the same path the listener takes.
 *
 * - Running on a run: the run's end, or its request for approval, is applied; a run the site no longer has ends
 *   the brief as failed.
 * - Accepted with no run since before this process started — hq stopped while starting it: the site's newest run
 *   on the worker is attached when it is this brief's, and otherwise the brief is started again. One accepted since
 *   is being started now, and is left to that. A brief being continued after an approval answer is
 *   continued as the site recorded the answer, or put back waiting when the site was never told.
 * - Queued: the worker's queue moves on, since the brief before it may have ended unheard.
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { CONTINUE_AFTER_APPROVAL, REPLACED_REQUEST_REFUSAL, continueAfterDenial } from '../../../agents/manifestRequests'
import { resolveSiteIdForSession } from '../../../agents/dispatchService'
import { settleOperation } from '../../coordinator/mailbox'
import { openText } from '../../sealing'
import { dispatchAccepted, schedulePump } from '../workers/queue'
import { handleWorkerRunStatus } from '../workers/runEvents'
import { frameOfRun } from '../workers/runReads'
import { isBriefInput } from '../workers/opening'
import { eachOperation } from './each'

/** When this process started: an operation accepted before it was being started by a process that has gone. */
export function processStartedAt(): Date {
  return new Date(Date.now() - process.uptime() * 1000)
}

/** What a brief whose run the site no longer has ends with. */
export const RUN_NOT_ON_SITE = 'The place this work ran has no record of it any more, so it cannot be followed.'

type WorkerOp = {
  id: string
  state: string
  siteId: string | null
  runId: string | null
  brief: string | null
  workerSessionId: string | null
  updatedAt: Date
}

async function followRun(op: WorkerOp, siteId: string, runId: string): Promise<void> {
  const run = await siteRuntimeStore.getRun(siteId, runId)
  if (!run) {
    if (await settleOperation(op.id, { state: 'FAILED', error: RUN_NOT_ON_SITE })) schedulePump(op.workerSessionId)
    return
  }
  const frame = frameOfRun(run)
  if (frame.status === 'RUNNING') return
  await handleWorkerRunStatus(frame, siteId)
}

/** The run that asked, for a brief taken off it by an approval answer: its card's key names it. */
async function askingRunOf(operationId: string): Promise<string | null> {
  const card = await prisma.conversationMessage.findFirst({
    where: { operationId, kind: 'APPROVAL_REQUEST', clientMessageId: { startsWith: `approval:${operationId}:` } },
    orderBy: { seq: 'desc' },
    select: { clientMessageId: true },
  })
  return card?.clientMessageId?.slice(`approval:${operationId}:`.length) || null
}

/** Whether another operation of this worker holds the run: then it is not this brief's. */
async function heldByAnother(op: WorkerOp, runId: string): Promise<boolean> {
  const other = await prisma.operation.findFirst({ where: { workerSessionId: op.workerSessionId, runId, id: { not: op.id } }, select: { id: true } })
  return other !== null
}

async function attach(op: WorkerOp, siteId: string, run: RunRow): Promise<void> {
  const { count } = await prisma.operation.updateMany({
    where: { id: op.id, state: 'ACCEPTED', runId: null },
    data: { state: 'RUNNING', siteId, runId: run.id },
  })
  if (count === 1) await followRun(op, siteId, run.id)
}

/** Continues a brief whose approval answer the site recorded, or puts it back waiting when it never heard one. */
async function continueAfterAnswer(op: WorkerOp, siteId: string, askingRunId: string): Promise<void> {
  const asked = await siteRuntimeStore.getRun(siteId, askingRunId)
  switch (asked?.manifestStatus) {
    case 'PENDING_APPROVAL':
      await prisma.operation.updateMany({
        where: { id: op.id, state: 'ACCEPTED', runId: null },
        data: { state: 'WAITING_FOR_APPROVAL', siteId, runId: askingRunId },
      })
      return
    case 'APPROVED':
      await dispatchAccepted(op.id, { text: CONTINUE_AFTER_APPROVAL, hidden: true })
      return
    case 'REJECTED':
      await dispatchAccepted(op.id, { text: continueAfterDenial(asked.pendingManifest, null), hidden: true })
      return
    default:
      if (await settleOperation(op.id, { state: 'FAILED', error: REPLACED_REQUEST_REFUSAL })) schedulePump(op.workerSessionId)
  }
}

/**
 * Takes an orphaned brief to reconcile, once: unchanged since it was read, so two sweeps at once (two connects of
 * one site) never both start it again.
 */
async function takeOrphan(op: WorkerOp): Promise<boolean> {
  const { count } = await prisma.operation.updateMany({
    where: { id: op.id, state: 'ACCEPTED', runId: null, updatedAt: op.updatedAt },
    data: { updatedAt: new Date() },
  })
  return count === 1
}

async function startedUnheard(op: WorkerOp, siteId: string): Promise<void> {
  if (!(await takeOrphan(op))) return
  const [newest] = await siteRuntimeStore.listRuns(siteId, { sessionId: op.workerSessionId!, limit: 1 })
  const askingRunId = await askingRunOf(op.id)
  const fresh = newest && newest.id !== askingRunId && !(await heldByAnother(op, newest.id))
  if (askingRunId) {
    if (fresh) return attach(op, siteId, newest)
    return continueAfterAnswer(op, siteId, askingRunId)
  }
  // A new brief's run is the one the site holds with the brief as its input; otherwise it never reached the site.
  if (fresh && isBriefInput(newest.inputText, openText(op.brief ?? ''))) return attach(op, siteId, newest)
  if (!(await dispatchAccepted(op.id))) schedulePump(op.workerSessionId)
}

/** Every outstanding brief of a worker on this site, read against the site. */
export async function reconcileWorkersOn(siteId: string, startedAt: Date = processStartedAt()): Promise<void> {
  const ops: WorkerOp[] = await prisma.operation.findMany({
    where: { kind: 'WORKER', state: { in: ['RUNNING', 'UNCERTAIN', 'ACCEPTED', 'QUEUED'] } },
    select: { id: true, state: true, siteId: true, runId: true, brief: true, workerSessionId: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const workers = new Set<string>()
  await eachOperation(ops, async (op) => {
    if (!op.workerSessionId) return
    if (op.siteId && op.runId) {
      if (op.siteId === siteId) await followRun(op, siteId, op.runId)
      return
    }
    const session = await prisma.agentSession.findUnique({ where: { id: op.workerSessionId } })
    if (!session || (await resolveSiteIdForSession(session).catch(() => null)) !== siteId) return
    if (op.state !== 'ACCEPTED') workers.add(op.workerSessionId)
    else if (op.updatedAt < startedAt) await startedUnheard(op, siteId)
  })
  for (const worker of workers) schedulePump(worker)
}
