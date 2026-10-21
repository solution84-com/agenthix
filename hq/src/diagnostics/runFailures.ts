/**
 * A run that failed on any site becomes a recent error (logs and diagnostics
 * spec, Recent errors), from its FAILED status frame.
 *
 * The frame is a site's claim, so it counts only from the site that owns the
 * run's session — the check every other side effect of a frame passes — and
 * the agent and project come from HQ's own session row, not from the frame.
 * A task run keeps its run and session for a link to it; a chat run keeps
 * the error, the agent and the site only, never the person, the
 * conversation or a link (adr-0041).
 */
import { prisma } from 'wasp/server'
import type { RunStatusEvent } from '@agenthix/core'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { sessionOwnedBy } from '../sites/channel/sessionOwnerSite'
import { runFailureAdvice } from './errorAdvice'
import { recordError } from './recordedErrors'

export async function recordRunFailure(e: RunStatusEvent, siteId: string): Promise<void> {
  if (e.status !== 'FAILED') return
  if (!(await sessionOwnedBy(e.sessionId, siteId))) return
  const session = await prisma.agentSession.findUnique({
    where: { id: e.sessionId },
    select: { agentId: true, taskId: true, task: { select: { projectId: true } } },
  })
  if (!session) return
  const isTask = session.taskId !== null
  await recordError({
    origin: 'run',
    subject: siteId,
    advice: runFailureAdvice(e.error),
    detail: e.error,
    siteId,
    agentId: session.agentId,
    projectId: isTask ? session.task?.projectId ?? null : null,
    runId: isTask ? e.runId : null,
    sessionId: isTask ? e.sessionId : null,
    occurrenceKey: `run:${e.runId}`,
  })
}

export function registerRunFailureRecorder(): void {
  onRunStatus('recent-errors', recordRunFailure)
}
