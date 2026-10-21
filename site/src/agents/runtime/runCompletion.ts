/**
 * The end of a run that streamed to completion, split out of AgentEngine.processRun
 * (R-071): persist the transcript and audit summary, mark the row COMPLETED, count
 * the run's tokens onto the session, and send the run's terminal frame — or, for a
 * deferred run, withhold it.
 *
 * A turn that was stopped ends here too, as CANCELLED: what it produced is kept
 * like any reply, followed by the row that says who stopped it.
 *
 * The runtime's memory of the conversation, when it said, is kept on the run
 * and on the session (core's `ContextUse`).
 */
import { prisma } from '#db'
import type { Prisma } from '@prisma/client'
import type { RunOptions, RunOutcome } from './types'
import { siteStream } from './SiteStreamEmitter'
import { persistRunOutput } from './runPersistence'
import type { TurnStop } from './turnStop'
import type { StreamedRun } from './runEventLoop'
import { hasDeferredRequests } from './deferredTerminal'
import { currentTitlePatch } from './sessionTitleFrame'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('AgentEngine')

type SessionPatch = NonNullable<RunOutcome['withheldFrame']>['sessionPatch']

export interface CompletedRun {
  runId: string
  sessionId: string
  taskId: string | null
  agent: { id: string; handle: string; defaultModel: string }
  resolvedModel: string
  streamed: StreamedRun
  options: Omit<RunOptions, 'queued'>
  /** The turn was stopped: why (the run's error), and who stopped it. */
  stopped?: TurnStop
  /** Who the run is for, named on a summary somebody asked for. */
  personId?: string | null
}

export async function completeRun(done: CompletedRun): Promise<RunOutcome> {
  const { runId, sessionId, taskId, agent, resolvedModel, streamed, options, stopped } = done
  const status = stopped ? 'CANCELLED' : 'COMPLETED'
  const { usedModel, runUsage, contextUse } = streamed

  // 7-8. Persist transcript + assemble audit summary from ToolCallLog rows for this run
  const { finalReply, auditSummary } = await persistRunOutput({
    sessionId,
    runId,
    streamed,
    resolvedModel,
    ending: stopped ? { kind: 'stopped', cause: stopped.cause, by: stopped.by } : { kind: 'completed' },
    summarise: options.summarise,
    personId: done.personId,
  })

  // 9. Mark COMPLETED (or CANCELLED)
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status,
      ...(stopped ? { error: stopped.error } : {}),
      outputText: finalReply ?? '[NO_REPLY]',
      model: usedModel ?? agent.defaultModel,
      endedAt: new Date(),
      auditSummary: auditSummary as unknown as Prisma.InputJsonValue,
      ...(runUsage ? { usage: runUsage } : {}),
      ...(contextUse ? { contextUse } : {}),
    }
  })

  // Increment session-level token totals for O(1) display — the authoritative
  // write (site owns AgentSession). The terminal status frame below replicates
  // the resulting absolute totals onto hq's own read-copy (D3).
  let sessionPatch: SessionPatch = null
  if (contextUse && !runUsage) {
    await prisma.agentSession.update({ where: { id: sessionId }, data: { contextUse } })
  }
  if (runUsage) {
    const updatedSession = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        totalInputTokens:      { increment: runUsage.inputTokens },
        totalOutputTokens:     { increment: runUsage.outputTokens },
        totalCacheReadTokens:  { increment: runUsage.cacheReadTokens  ?? 0 },
        totalCacheWriteTokens: { increment: runUsage.cacheWriteTokens ?? 0 },
        ...(contextUse ? { contextUse } : {}),
      },
    })
    sessionPatch = {
      totalInputTokens: updatedSession.totalInputTokens,
      totalOutputTokens: updatedSession.totalOutputTokens,
      totalCacheReadTokens: updatedSession.totalCacheReadTokens,
      totalCacheWriteTokens: updatedSession.totalCacheWriteTokens,
    }
  }
  // The RUNNING frame's title is sent once and never regenerated, so the
  // terminal frame repeats the title — read from site's row, which holds any
  // mid-run rename — so a lost RUNNING frame must not strand hq's copy.
  const titlePatch = await currentTitlePatch(sessionId)
  if (titlePatch) sessionPatch = { ...sessionPatch, ...titlePatch }

  // Spec review (BLOCKER 1): a deferred run must produce exactly ONE
  // terminal frame, not two. Two frames made hq's terminal-frame latch
  // (siteEventHandler.ts) finalize the task off THIS one (manifestPending:
  // null) before deferredManifestReport's own frame — carrying the
  // manifestPending that actually matters — ever arrived; the latch then
  // silently dropped it, so HITL approval never happened and the task
  // falsely reported success. When the collector is non-empty at this
  // point, the driver's post-run report (deferredManifestReport.ts) is
  // the single terminal frame instead — this call is withheld, and the
  // outcome carries what it would have sent so that report can relay it
  // verbatim (RunOutcome.withheldFrame).
  const deferred = hasDeferredRequests(options)
  if (!deferred) {
    siteStream.status({
      runId,
      sessionId,
      taskId,
      agentId: agent.id,
      agentHandle: agent.handle,
      status,
      error: stopped?.error ?? null,
      sessionPatch,
      // Drivers own manifest state — Task 8.
      manifestPending: null,
    })
  }

  if (stopped) logger.info(`Run ${runId} stopped: ${stopped.error}.`)
  else logger.success(`Run ${runId} finished.`)
  return deferred
    ? { status, withheldFrame: { sessionPatch, ...(stopped ? { error: stopped.error } : {}) } }
    : { status }
}
