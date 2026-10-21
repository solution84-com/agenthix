/**
 * Shared post-run continuation for chat and task execution (plan 5d-2 task 8;
 * redesigned at the cutover's spec review, BLOCKER 1 — one terminal frame per
 * run).
 *
 * A deferred run — one whose tool-request collector ends up non-empty — sends
 * exactly ONE terminal `run.status` frame, and THIS module is what sends it:
 * `AgentEngine.processRun` withholds its own terminal frame whenever
 * `options.deferredManifest` is non-empty at terminal time (its own doc
 * comment), returning what it would have sent as `RunOutcome.withheldFrame`
 * instead. This module updates the run row to PENDING_APPROVAL, pushes the
 * live-UI `manifestPendingApproval` stream frame, and sends the run's single
 * terminal `run.status` frame — carrying the TRUE terminal status, the
 * `manifestPending` payload, and the withheld `sessionPatch`
 * passed straight through from the outcome.
 *
 * The TWO-frame version this replaced had a real bug, not just a latency
 * cost: the engine's own frame (always `manifestPending: null`) finalized
 * hq's task-machine BEFORE this module's frame — carrying the
 * `manifestPending` that actually mattered — ever arrived. hq's
 * terminal-frame latch (siteEventHandler.ts) then silently skipped every
 * side effect on the second frame, INCLUDING the ones this module's frame
 * exists to trigger: the BLOCKED transition and the approval comment never
 * happened, the task falsely reported success, and the run sat
 * PENDING_APPROVAL on site forever with no way to reach it. One frame per
 * run removes the ordering hazard outright rather than patching around it.
 *
 * `terminalStatus` is supplied by the CALLER, not
 * assumed here: `agentEngine.run(...)` genuinely resolves — never rejects —
 * on a FAILED or CANCELLED run too (its catch path returns the status it
 * wrote, it does not rethrow), so a run that accumulated a non-empty
 * deferredManifest and then still failed for an unrelated reason (a
 * provider outage after the agent already requested an extended tool, say)
 * must relay FAILED here, not silently claim COMPLETED. The caller reads
 * this straight off `agentEngine.run(...)`'s own resolved `RunOutcome` — see
 * types.ts's doc comment for why that is now always the truthful terminal
 * status rather than an assumption made at this call site.
 */
import { prisma } from '#db'
import type { DeferredManifest, RunOutcome } from '../../agents/runtime/types'
import { siteStream } from '../../agents/runtime/SiteStreamEmitter'
import { Logger } from '../utils/logger'

const logger = new Logger('DeferredManifestReport')

export interface DeferredReportOptions {
  runId: string
  sessionId: string
  taskId: string | null
  agentId: string
  agentHandle: string
  deferredManifest: DeferredManifest
  /** The run's genuine terminal status, straight from `agentEngine.run(...)`'s
   *  resolved `RunOutcome` — never assumed COMPLETED here. */
  terminalStatus: RunOutcome['status']
  /** What the engine withheld from its own terminal frame — `undefined` only
   *  when the outcome itself was `undefined` (the engine's dedup/skip
   *  branches, an unreachable case here per this module's own empty-collector
   *  check below). Passed straight through onto this module's own frame. */
  withheldFrame?: RunOutcome['withheldFrame']
  /** Chat frames target the session room with a null summary (the reply is already
   *  visible as a chat bubble); task frames target the task room with a real summary
   *  (TaskRunner.execute's original behaviour, lines 335-343). */
  flavor: 'chat' | 'task'
}

export async function reportDeferredManifestIfAny(opts: DeferredReportOptions): Promise<void> {
  const { runId, sessionId, taskId, agentId, agentHandle, deferredManifest, terminalStatus, withheldFrame, flavor } = opts
  if (deferredManifest.tools.length === 0 && deferredManifest.bashPatterns.length === 0) return

  let summary: string | null = null

  // This module is the SOLE sender of the run's only terminal frame (see the
  // module doc comment) — a DB failure anywhere in the pre-send work below
  // must not mean the run never finalizes. The
  // callers only `.catch(log)` this promise, so without this try/catch a
  // rejection here (e.g. the prisma.agentRun.update below) meant NO terminal
  // frame was ever sent — hq's task hung RUNNING indefinitely. On any
  // failure here, fall back to a plain terminal frame (manifestPending: null
  // — the approval card is lost, a pre-existing, accepted degradation) and
  // rethrow so the caller's own `.catch(log)` still records the real cause.
  try {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { manifestStatus: 'PENDING_APPROVAL', pendingManifest: deferredManifest as any },
    })
    await recordRequestInTranscript(runId, sessionId)

    if (flavor === 'task') {
      // TaskRunner.execute's original summary resolution (lines 339-346): the agent's
      // last ASSISTANT message already explains what it needed and why; fall back to a
      // computed summary only when no transcript entry exists.
      const lastEntry = await prisma.transcriptEntry.findFirst({
        where: { sessionId, role: 'ASSISTANT' },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      })
      summary = lastEntry?.content?.slice(0, 300)
        ?? deferredManifest.tools.map(t => (t.reason ? `${t.name} (${t.reason})` : t.name)).join(', ')
    }
    // Chat frames carry no summary (design decision): the agent's final message is
    // already visible as a chat bubble directly above the approval card.

    siteStream.stream({
      sessionId,
      runId,
      taskId,
      targetRoom: flavor === 'task' ? 'task' : 'session',
      name: 'manifestPendingApproval',
      data: flavor === 'task'
        ? { runId, taskId, summary, pendingManifest: deferredManifest }
        : { runId, sessionId, summary: null, pendingManifest: deferredManifest },
    })
  } catch (err) {
    logger.error(
      `run ${runId} — deferred-manifest report failed before its terminal frame could be sent; sending a fallback terminal frame (approval card lost)`,
      err,
    )
    siteStream.status({
      runId,
      sessionId,
      taskId,
      agentId,
      agentHandle,
      status: terminalStatus,
      error: withheldFrame?.error ?? null,
      sessionPatch: withheldFrame?.sessionPatch ?? null,
      manifestPending: null,
    })
    throw err
  }

  siteStream.status({
    runId,
    sessionId,
    taskId,
    agentId,
    agentHandle,
    status: terminalStatus,
    // A run stopped at a limit, or failed, says why beside its request.
    error: withheldFrame?.error ?? null,
    // Relayed verbatim from what the engine withheld — the token totals a
    // COMPLETED run wrote (null for FAILED/CANCELLED, which never patch
    // usage) and, for a completed voice turn, the reply text itself. This is
    // the run's ONLY terminal frame now, so whatever the engine would have
    // sent must ride on this one instead of being lost.
    sessionPatch: withheldFrame?.sessionPatch ?? null,
    manifestPending: { runId, summary, pendingManifest: deferredManifest },
  })

  logger.info(`run ${runId} — deferred tools pending approval (${flavor})`)
}

/**
 * The request's place in the conversation: a row where the run ended asking.
 * The request itself and its answer stay on the run, read with the row
 * (transcriptRows.ts). Best effort — the approval card must not be lost to it.
 */
async function recordRequestInTranscript(runId: string, sessionId: string): Promise<void> {
  try {
    await prisma.transcriptEntry.create({ data: { sessionId, runId, role: 'SYSTEM', kind: 'APPROVAL_REQUESTED', content: '' } })
  } catch (err) {
    logger.warn(`run ${runId} — the request's place in the transcript could not be written: ${err instanceof Error ? err.message : String(err)}`)
  }
}
