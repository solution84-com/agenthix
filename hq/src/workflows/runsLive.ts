/**
 * A run's changes, live (workflows spec part 2, *Steps and progress*): each step event and the result tell the run's
 * page and its card in the conversation that it changed, as hq tells a person their runs changed. An event carries
 * the run's id, its workflow and its state, and no more; a screen reads the rest, so nothing on the socket holds
 * output. Also how `run_workflow` waits for a run to end.
 */
import { prisma } from 'wasp/server'
import { personRoom } from '../server/personEvents'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { WORKFLOW_RUN_SOCKET_EVENT, type WorkflowRunSocketEvent } from './runsSocketEvent'
import type { WorkflowPlace } from './placeAccess'

const SESSIONS_MAX = 5_000
const sessions = new Map<string, string>()

/** The conversation an agent's run was started from, so its card hears of the run. */
export function rememberRunSession(runId: string, sessionId: string): void {
  sessions.set(runId, sessionId)
  if (sessions.size > SESSIONS_MAX) sessions.delete(sessions.keys().next().value!)
}

async function sessionOf(run: { id: string; siteId: string; agentRunId: string | null }): Promise<string | null> {
  const known = sessions.get(run.id)
  if (known || !run.agentRunId) return known ?? null
  const agentRun = await siteRuntimeStore.getRun(run.siteId, run.agentRunId).catch(() => null)
  if (agentRun?.sessionId) rememberRunSession(run.id, agentRun.sessionId)
  return agentRun?.sessionId ?? null
}

/** Who can read the place: the person for their own storage, a project's members. */
async function placeReaders(place: WorkflowPlace): Promise<string[]> {
  if (place.type === 'user') return [place.id]
  const [project, members] = await Promise.all([
    prisma.project.findUnique({ where: { id: place.id }, select: { personalOwnerId: true } }),
    prisma.projectMember.findMany({ where: { projectId: place.id }, select: { userId: true } }),
  ])
  return [...new Set([...(project?.personalOwnerId ? [project.personalOwnerId] : []), ...members.map((m) => m.userId)])]
}

type Emitter = { to(room: string): { emit(event: string, data: unknown): void } }

export type LiveRun = {
  id: string
  workflowId: string
  siteId: string
  agentRunId: string | null
  placeType: WorkflowPlace['type']
  placeId: string
  state: string
}

/** Best effort: a failure here never reaches the run. */
export async function emitWorkflowRunChanged(run: LiveRun): Promise<void> {
  const io = (globalThis as { __wasp_io__?: Emitter }).__wasp_io__
  if (!io) return
  const payload: WorkflowRunSocketEvent = { runId: run.id, workflowId: run.workflowId, state: run.state.toLowerCase() }
  try {
    const [sessionId, readers] = await Promise.all([sessionOf(run), placeReaders({ type: run.placeType, id: run.placeId })])
    if (sessionId) io.to(`session:${sessionId}`).emit(WORKFLOW_RUN_SOCKET_EVENT, payload)
    for (const userId of readers) io.to(personRoom(userId)).emit(WORKFLOW_RUN_SOCKET_EVENT, payload)
  } catch {
    // The next event, or a read of the run, brings the screen up to date.
  }
}

const waiters = new Map<string, Set<() => void>>()

/** Resolves when the run ends or `ms` has passed, whichever is first. */
export function waitForRunEnd(runId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let set = waiters.get(runId)
    if (!set) waiters.set(runId, (set = new Set()))
    const done = () => {
      clearTimeout(timer)
      set!.delete(done)
      if (set!.size === 0) waiters.delete(runId)
      resolve()
    }
    const timer = setTimeout(done, ms)
    set.add(done)
  })
}

export function notifyRunEnded(runId: string): void {
  for (const done of [...(waiters.get(runId) ?? [])]) done()
}
