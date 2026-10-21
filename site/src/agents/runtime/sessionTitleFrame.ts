import { readCurrentSessionTitle } from './currentSessionTitle'
import { siteStream } from './SiteStreamEmitter'

/**
 * The `sessionPatch` fragment that repeats a session's title on a frame, or null
 * when the session is still untitled (or the read failed). Terminal frames carry
 * it because the RUNNING frame's copy is sent once and may be lost.
 */
export async function currentTitlePatch(sessionId: string): Promise<{ title: string } | null> {
  const title = await readCurrentSessionTitle(sessionId)
  return title ? { title } : null
}

const REPORTABLE_STATUSES = new Set(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])

/**
 * A run that was skipped — cancelled while it waited, or no longer PENDING —
 * sends no frame of its own, but its dispatch may have just named the session on
 * site's row, and nothing else would ever tell hq (a titled row is never named
 * again). So the title rides on a frame that reports the run's true stored status.
 * Sent only when this dispatch generated a title, and only for a run that exists.
 */
export function reportSkippedRunTitle(
  run: { id: string; sessionId: string; taskId: string | null; agentId: string; status: string } | null | undefined,
  agent: { id: string; handle: string },
  generatedTitle: string | null | undefined,
): Promise<void> {
  if (!generatedTitle || !run || !REPORTABLE_STATUSES.has(run.status)) return Promise.resolve()
  return currentTitlePatch(run.sessionId).then(sessionPatch => {
    if (!sessionPatch) return
    siteStream.status({
      runId: run.id,
      sessionId: run.sessionId,
      taskId: run.taskId ?? null,
      agentId: agent.id,
      agentHandle: agent.handle,
      status: run.status as 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
      error: null,
      sessionPatch,
      manifestPending: null,
    })
  })
}
