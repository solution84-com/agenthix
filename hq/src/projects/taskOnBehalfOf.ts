/**
 * Every task is done on behalf of a person (adr-0089): who it is for, and who
 * last queued it. Creating a task takes a `TaskOrigin`, so no creation path can
 * leave the person out.
 */
import { mayWorkInProject } from './membership'
import { isActivePerson } from '../server/identity/people'
import { LOST_ACCESS_REASON } from '../agents/taskExecutionReasons'

/** Who put a task in the queue: a person, or an agent during a run (its session). */
export type Queuer =
  | { kind: 'person'; userId: string }
  | { kind: 'agent'; agentId: string; sessionId: string }

export type QueuedByFields = {
  queuedByUserId: string | null
  queuedByAgentId: string | null
  queuedBySessionId: string | null
}

/**
 * The columns that say who last queued a task. Written by every path that sets
 * a run of a task queued; `null` when no one is behind the act.
 */
export function queuedBy(queuer: Queuer | null): QueuedByFields {
  if (!queuer) return { queuedByUserId: null, queuedByAgentId: null, queuedBySessionId: null }
  return queuer.kind === 'person'
    ? { queuedByUserId: queuer.userId, queuedByAgentId: null, queuedBySessionId: null }
    : { queuedByUserId: null, queuedByAgentId: queuer.agentId, queuedBySessionId: queuer.sessionId }
}

export function personQueuer(userId: string): Queuer {
  return { kind: 'person', userId }
}

/** Who a new task is done on behalf of, and who would be queueing it if it is created queued. */
export interface TaskOrigin {
  onBehalfOfUserId: string
  queuer: Queuer
}

/** A task a person created themselves is on their own behalf. */
export function originByPerson(userId: string): TaskOrigin {
  return { onBehalfOfUserId: userId, queuer: personQueuer(userId) }
}

/** A task an agent created during a run, on behalf of the person that run was for. */
export function originByAgentRun(onBehalfOfUserId: string, agentId: string, sessionId: string): TaskOrigin {
  return { onBehalfOfUserId, queuer: { kind: 'agent', agentId, sessionId } }
}

export { LOST_ACCESS_REASON }

/**
 * Whether work may be done on the person's behalf in the project: they are
 * still in the organisation (adr-0100) and work in it — a Member or Admin, not
 * a Viewer (adr-0102, adr-0101). Someone who has left has no member rows, but
 * is checked here too so no stale row can stand in for them.
 */
export async function personMayWorkInProject(projectId: string, userId: string): Promise<boolean> {
  if (!(await isActivePerson(userId))) return false
  return mayWorkInProject(projectId, userId)
}

/** Thrown at dispatch when a task's person has lost access; the task is blocked rather than failed. */
export class OnBehalfOfLostAccessError extends Error {
  constructor(public readonly taskId: string) {
    super(LOST_ACCESS_REASON)
    this.name = 'OnBehalfOfLostAccessError'
  }
}
