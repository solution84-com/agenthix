/**
 * The end of a run that threw, split out of AgentEngine.processRun's `catch`
 * (R-071): record FAILED or CANCELLED on the row and send the terminal frame —
 * or withhold it for a deferred run.
 *
 * What the turn did before it failed is kept in the transcript, followed by a
 * row with the reason in plain words where its reply would be; the raw error
 * stays on the run (core's `plainFailureReason`).
 */
import { prisma } from '#db'
import { plainFailureReason, runResourceSentence, type RunContextPayload, type RunResourceShortage } from '@agenthix/core'
import type { RunOptions, RunOutcome } from './types'
import { persistRunOutput } from './runPersistence'
import { newStreamedRun, type StreamedRun } from './runEventLoop'
import type { TurnStop } from './turnStop'
import { siteStream } from './SiteStreamEmitter'
import type { RunLaunchSink } from './runLaunch'
import { hasDeferredRequests } from './deferredTerminal'
import { currentTitlePatch } from './sessionTitleFrame'
import { ConversationClosedError } from './sessionExistenceCheck'
import { ReadableRunError } from './readableRunError'
import { runResourceCause } from './runResourceCause'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('AgentEngine')

/** What the turn had done when it ended, for the transcript. */
export type FailedTurn = { streamed?: StreamedRun; resolvedModel?: string; stopped?: TurnStop }

export async function failRun(
  runId: string,
  error: { name?: string; message?: string },
  options: Omit<RunOptions, 'queued'>,
  ctx: RunContextPayload,
  sink: RunLaunchSink,
  turn: FailedTurn = {},
): Promise<RunOutcome> {
  logger.error(`FATAL ERROR for run ${runId}:`, error)
  const status = error.name === 'AbortError' || error.message?.includes('aborted')
    ? 'CANCELLED'
    : 'FAILED'

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status, error: error.message || String(error), endedAt: new Date() }
  }).catch(() => {})

  // Same withholding as the COMPLETED path — a run that accumulated
  // deferred requests and THEN still failed for an unrelated reason must
  // not send its own terminal frame either; deferredManifestReport.ts is
  // the one place that decides what a FAILED-but-deferred run reports
  // (its own doc comment: relay the true status, never assume success).
  const deferred = hasDeferredRequests(options)
  // A run that stopped for lack of memory, disk or processes says so (core's runResource.ts); hq writes the words.
  const resource = status === 'FAILED' && !readable(error)
    ? await runResourceCause({ error: error.message, containerName: sink.containerName, baseline: sink.resourceBaseline })
      .catch(() => null)
    : null
  // The capability check runs before the launch has fetched the run row, so a
  // rejected capability leaves `sink.run` unset; the row is read here instead so
  // that failure is reported too, on the run's own session and task.
  const run = sink.run ?? await prisma.agentRun
    .findUnique({ where: { id: runId }, select: { sessionId: true, taskId: true } })
    .catch(() => null)
  if (run?.sessionId) await recordEnding(runId, run.sessionId, status, error, ctx, turn, resource)

  // Repeats the title as the COMPLETED path does — a run can fail before its
  // RUNNING frame was ever sent.
  const titlePatch = run?.sessionId ? await currentTitlePatch(run.sessionId) : null
  // A run refused because its conversation is closed carries the closed status
  // to hq's copy on this frame — the only way hq learns it (adr-0076).
  const failurePatch = error instanceof ConversationClosedError
    ? { ...titlePatch, status: 'CLOSED' as const, closedReason: error.closedReason }
    : titlePatch

  // AgentRun.sessionId is a required column — there is no run to report status
  // for without one, so unlike hq's original `run:${runId}` fallback room, there
  // is no room-kind to invent here when the row never resolved.
  if (run?.sessionId && !deferred) {
    siteStream.status({
      runId,
      sessionId: run.sessionId,
      taskId: run.taskId ?? null,
      agentId: ctx.agent.id,
      agentHandle: ctx.agent.handle,
      status,
      error: error.message || String(error),
      ...(resource ? { resource } : {}),
      sessionPatch: failurePatch,
      manifestPending: null,
    })
  }
  // Genuinely resolves (never rejects) on a failed run too — deliberate:
  // callers (chatExecution.ts/taskExecution.ts) need the REAL terminal
  // status even when the run failed, to relay a truthful second frame
  // for a deferred-manifest report rather than
  // assuming success just because this promise settled.
  return deferred
    ? { status, withheldFrame: { sessionPatch: failurePatch, error: error.message || String(error) } }
    : { status }
}

const readable = (error: { message?: string }) =>
  (error instanceof ReadableRunError || error instanceof ConversationClosedError) && !!error.message

/** Best effort: a transcript that cannot be written must not keep the run from ending. */
async function recordEnding(
  runId: string,
  sessionId: string,
  status: 'FAILED' | 'CANCELLED',
  error: { message?: string },
  ctx: RunContextPayload,
  turn: FailedTurn,
  resource: RunResourceShortage | null,
): Promise<void> {
  const stop = turn.stopped
  await persistRunOutput({
    sessionId,
    runId,
    streamed: turn.streamed ?? newStreamedRun(),
    resolvedModel: turn.resolvedModel ?? ctx.agent.defaultModel,
    ending: status === 'CANCELLED'
      ? { kind: 'stopped', cause: stop?.cause ?? 'harness', by: stop?.by ?? null }
      : resource
        // hq names the site in its place when it reads the row (`detail.resource`).
        ? { kind: 'failed', reason: runResourceSentence(resource, 'this site'), resource }
        : { kind: 'failed', reason: readable(error) ? error.message! : plainFailureReason(error.message) },
  }).catch(err => logger.warn(`Run ${runId}: its ending could not be written to the transcript: ${err instanceof Error ? err.message : String(err)}`))
}
