/**
 * A run asked to pause for a scheduled change (host-management spec §14). A run not started yet is
 * cancelled at once and hq told, since no turn of it will send an end of its own. A running one finishes the step
 * it is on and is stopped at its next tool call (toolGateRuns.ts), or at the deadline when no call comes, so a
 * long answer cannot hold the change up. Either way the run's error is `runPausedReason`, which hq reads to
 * carry the task on in the same conversation once the change is done.
 */
import { prisma } from '#db'
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS } from '@agenthix/core'
import { siteStream } from './SiteStreamEmitter'
import { pauseGateRun, reachGatePause } from './toolGateRuns'
import { turnStop, type PauseStop } from './turnStop'

/** The longest a running run is given to reach the end of its step: the lead hq pauses runs at. */
export const RUN_PAUSE_DEADLINE_MS = SCHEDULED_CHANGE_PAUSE_LEAD_MS

/** Cancels the run if it has not started; false when it has (or has ended). */
async function cancelNotStarted(runId: string, error: string): Promise<boolean> {
  const { count } = await prisma.agentRun.updateMany({
    where: { id: runId, status: 'PENDING' },
    data: { status: 'CANCELLED', endedAt: new Date(), error },
  })
  if (count === 0) return false
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { sessionId: true, taskId: true, agentId: true } })
  if (run) {
    siteStream.status({
      runId, sessionId: run.sessionId, taskId: run.taskId, agentId: run.agentId, agentHandle: run.agentId,
      status: 'CANCELLED', error, sessionPatch: null, manifestPending: null,
    })
  }
  return true
}

/** `stop` stops the running turn with the given reason (AgentEngine's one way of stopping a run). */
export async function pauseRun(runId: string, by: string | null, stop: (reason: PauseStop) => Promise<void>): Promise<void> {
  const reason: PauseStop = { paused: true, by }
  if (await cancelNotStarted(runId, turnStop(reason).error)) return
  pauseGateRun(runId, () => { void stop(reason) })
  const deadline = setTimeout(() => reachGatePause(runId), RUN_PAUSE_DEADLINE_MS)
  deadline.unref?.()
}
