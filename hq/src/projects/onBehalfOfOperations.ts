/**
 * Who a task is done on behalf of, read and changed from the task page
 * (adr-0089). Reading it is for anyone who can see the task. Changing it is a
 * project admin's, and only to someone who can reach the project; that is also
 * what releases a task blocked because its person lost access.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireProjectAdmin } from './membership'
import { requireTaskVisible } from './resourceEntitlement'
import { createTaskComment } from './taskStateService'
import { LOST_ACCESS_REASON, personMayWorkInProject } from './taskOnBehalfOf'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'

type Ctx = { user?: { id: string } | null }

export type PersonRef = {
  userId: string
  /** The person's name as shown (`personSummary.ts`): "Former member" once erased. */
  username: string | null
}

export type TaskOnBehalfOf = {
  onBehalfOf: PersonRef & { hasAccess: boolean }
  queuedBy:
    | { kind: 'person'; person: PersonRef }
    | { kind: 'agent'; agentId: string; agentName: string | null; agentHandle: string | null; sessionId: string | null }
    | null
  blockedForLostAccess: boolean
  canReassign: boolean
  /** The people it may be given to — only for someone who may reassign it. */
  candidates: PersonRef[]
}

/** Each person's name as shown, by id — the shared rule (server/identity/people.ts). */
export async function usernames(userIds: string[]): Promise<Map<string, string>> {
  const people = await peopleByIds(userIds)
  return new Map([...people].map(([id, p]) => [id, p.name]))
}

/** Everyone who may act in the project: its member list (adr-0099) but its Viewers (adr-0102), without anyone who has left. */
export async function entitledPeople(projectId: string): Promise<PersonRef[]> {
  const rows = await prisma.projectMember.findMany({
    // A Viewer has no work done on their behalf (adr-0102).
    where: { projectId, user: ACTIVE_PERSON, role: { not: 'VIEWER' } },
    select: { userId: true },
  })
  const ids = rows.map(m => m.userId)
  const names = await usernames(ids)
  return ids
    .map(userId => ({ userId, username: names.get(userId) ?? null }))
    .sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''))
}

async function isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return row?.role === 'ADMIN'
}

export const getTaskOnBehalfOf = async ({ taskId }: { taskId: string }, context: Ctx): Promise<TaskOnBehalfOf | null> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!taskId) return null
  const projectId = await requireTaskVisible(taskId, context.user.id)
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      onBehalfOfUserId: true, queuedByUserId: true, queuedByAgentId: true, queuedBySessionId: true,
      runState: true, runStateReason: true,
    },
  })
  if (!task) throw new HttpError(404, 'Task not found')

  const names = await usernames([task.onBehalfOfUserId, ...(task.queuedByUserId ? [task.queuedByUserId] : [])])
  const person = (userId: string): PersonRef => ({ userId, username: names.get(userId) ?? null })

  let queuedBy: TaskOnBehalfOf['queuedBy'] = null
  if (task.queuedByUserId) {
    queuedBy = { kind: 'person', person: person(task.queuedByUserId) }
  } else if (task.queuedByAgentId) {
    const agent = await prisma.agent.findUnique({ where: { id: task.queuedByAgentId }, select: { name: true, handle: true } })
    queuedBy = {
      kind: 'agent', agentId: task.queuedByAgentId, agentName: agent?.name ?? null,
      agentHandle: agent?.handle ?? null, sessionId: task.queuedBySessionId,
    }
  }

  const canReassign = await isProjectAdmin(projectId, context.user.id)
  return {
    onBehalfOf: { ...person(task.onBehalfOfUserId), hasAccess: await personMayWorkInProject(projectId, task.onBehalfOfUserId) },
    queuedBy,
    blockedForLostAccess: task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON,
    canReassign,
    candidates: canReassign ? await entitledPeople(projectId) : [],
  }
}

export const setTaskOnBehalfOf = async (
  { taskId, userId }: { taskId: string; userId: string },
  context: Ctx,
): Promise<{ ok: true }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, boardId: true, onBehalfOfUserId: true, runState: true, runStateReason: true },
  })
  if (!task) throw new HttpError(404, 'Task not found')
  await requireProjectAdmin(task.projectId, context.user.id, 'Choosing who this task is done on behalf of')
  if (!(await personMayWorkInProject(task.projectId, userId))) {
    throw new HttpError(400, 'That person cannot work in this project')
  }

  const releases = task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON
  if (task.onBehalfOfUserId === userId && !releases) return { ok: true }

  // Released to no run pending (RUN_NONE), not back to the queue: the new person has not yet chosen
  // to run it, so a person queues or runs it again.
  await prisma.task.update({
    where: { id: taskId },
    data: {
      onBehalfOfUserId: userId,
      ...(releases ? { runState: 'RUN_NONE', runStateReason: null } : {}),
    },
  })
  const name = (await usernames([userId])).get(userId) ?? userId
  await createTaskComment({
    taskId,
    authorType: 'USER',
    userId: context.user.id,
    content: `This task is now done on behalf of ${name}.`,
  })
  if (task.boardId) {
    const { emitTaskUpdated } = await import('../server/socket')
    emitTaskUpdated(task.boardId)
  }
  triggerSnapshotPush()
  return { ok: true }
}
