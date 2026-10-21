import type { RunStatusEvent } from '@agenthix/core'

/**
 * The runs hq has seen start and not yet seen end, per session. hq keeps no
 * run rows — they live on the site — so when a site is revoked mid-run, this
 * is the only record of which run a browser is still waiting on. The browser
 * ignores a status event whose runId is not the run it is showing, so the
 * runId has to be the right one.
 *
 * In memory and best effort, like the frames it is built from: a lost frame
 * or a restart of hq leaves a run untracked, which costs one stuck spinner
 * until the page is reloaded — what happened before this existed.
 */
const activeRuns = new Map<string, { runId: string; siteId: string }>()

export function __resetActiveRunsForTests(): void {
  activeRuns.clear()
}

/** How many runs hq has seen start and not end, on every site: what hq's machine status counts as agents working. */
export function activeRunCount(): number {
  return activeRuns.size
}

/** `siteId` is only needed for a run starting; a terminal frame just closes it. */
export function trackRunStatus(e: Pick<RunStatusEvent, 'runId' | 'sessionId' | 'status'>, siteId?: string): void {
  if (e.status === 'RUNNING') {
    if (siteId) activeRuns.set(e.sessionId, { runId: e.runId, siteId })
    return
  }
  // A late terminal frame for an older run must not close the session's newer one.
  if (activeRuns.get(e.sessionId)?.runId === e.runId) activeRuns.delete(e.sessionId)
}

type SocketServer = { to(room: string): { emit(event: string, data: unknown): void } }

/** Tells each session's room that its run on the revoked site failed, then forgets it. */
export function failRunsForRevokedSite(siteId: string, error: string): void {
  const io = (globalThis as { __wasp_io__?: SocketServer }).__wasp_io__
  for (const [sessionId, run] of activeRuns) {
    if (run.siteId !== siteId) continue
    activeRuns.delete(sessionId)
    io?.to(`session:${sessionId}`).emit('agentRunStatus', { runId: run.runId, status: 'FAILED', error })
  }
}
