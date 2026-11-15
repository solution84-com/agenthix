/**
 * Task Service
 * ============
 * Pure business logic for tasks: listing, creation, edits and deletion. A task
 * is on no board (adr-0176): its place is its type's column, which taskPlace.ts
 * writes and taskColumnService.ts moves. No auth, no HTTP. Re-exported from
 * `projectService`.
 */
import { prisma } from 'wasp/server'
import { HttpError } from 'wasp/server'
import { Prisma, type TaskPriority, type TaskExecutionState, type TaskRunState, type TaskState } from '@prisma/client'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { recordActivity } from '../server/dashboard/activity'
import { type TaskOrigin } from './taskOnBehalfOf'
import { taskDeleted, taskLeadChanged } from '../conversations/taskThread/lifecycle'
import { deleteTaskSessionsOnSites } from '../sessions/taskSessionDeletion'
import { resolveSiteIdForTask } from '../agents/dispatchSiteResolution'
import { leaveRoomsNoLongerAllowed } from '../server/roomAccess'
import { removeTaskAttachmentFolders } from './taskAttachmentFiles'
import { actorOf, changedFields, recordTaskActivity, type TaskActor } from './taskActivity'
import { withExecutionState } from './executionState'
import { lockProjectOrder, placeData, rankAtEnd, resolveNewTaskPlace } from './taskPlace'
import { notifyBoardsOfTasks } from './boardNotify'
import { TASK_KIND_INCLUDE } from './taskWire'

export { archiveTask, unarchiveTask } from './taskArchive'

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTask(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      sprint:  { select: { id: true, number: true, name: true, startDate: true, finishDate: true, finishedAt: true } },
      epic:    { select: { id: true, number: true, title: true } },
      milestone: { select: { id: true, name: true, date: true } },
      project: { select: { name: true, key: true } },
    },
  })
}

/**
 * `project` is required, not optional: an agent's queue spans every project it
 * is assigned in, so the caller must say which of them the reader may see —
 * `undefined` only for a reader entitled to all of them.
 */
export async function listAgentTasks(agentId: string, project: Prisma.ProjectWhereInput | undefined) {
  return prisma.task.findMany({
    where: {
      assignedAgentId: agentId, runState: 'RUN_QUEUED', state: { not: 'BACKLOG' },
      ...(project ? { project } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createTask(params: {
  title: string
  projectId: string
  assignedAgentId?: string
  description?: string
  labels?: string[]
  priority?: string
  /** The model its runs name (`<providerId>/<model>`), already checked; null follows the default. */
  modelChoice?: string | null
  /** The workspace its work is done in, already checked (branches/taskWorkspace.ts); null for the project's files. */
  workspaceId?: string | null
  /** Who the task is done on behalf of (adr-0089), and who made it. */
  origin: TaskOrigin
  /** One of the project's task types (adr-0174); omitted: Task. */
  typeId?: string | null
  /** One of the type's columns; omitted: the type's default column for `state`, or for Backlog. */
  columnId?: string | null
  state?: TaskState | null
}) {
  const { priority, labels, origin, typeId, columnId, state, ...rest } = params
  const place = await resolveNewTaskPlace(params.projectId, { typeId, columnId, state })

  const task = await prisma.$transaction(async (tx) => {
    // A new task goes last in the project's order (N2). Of two made at once, the serializable transaction lets one
    // through and refuses the other, so neither its number nor its rank is taken twice.
    await lockProjectOrder(tx, params.projectId)
    const agg = await tx.task.aggregate({
      where: { projectId: params.projectId },
      _max: { number: true },
    })
    const number = (agg._max.number ?? 0) + 1
    const rank = await rankAtEnd(tx, params.projectId)
    return tx.task.create({
      data: {
        ...rest,
        ...placeData(place.column, place.kind),
        rank,
        priority:       (priority?.toUpperCase() as TaskPriority | undefined) ?? 'MEDIUM',
        labels:         labels ?? [],
        runState: 'RUN_NONE',
        onBehalfOfUserId: origin.onBehalfOfUserId,
        number,
      },
      include: TASK_KIND_INCLUDE,
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  await recordTaskActivity({ taskId: task.id, kind: 'CREATED', actor: actorOf(origin.queuer) })
  await notifyBoardsOfTasks([task.id])

  // No column starts work (adr-0175): a new task waits until someone starts it.
  triggerSnapshotPush()
  return task
}

export async function updateTask(params: {
  taskId: string
  title?: string
  description?: string
  assignedAgentId?: string | null
  priority?: string
  labels?: string[]
  modelChoice?: string | null
  /** The workspace its work is done in, already checked (branches/taskWorkspace.ts); null for the project's files. */
  workspaceId?: string | null
  /** System use only (a person's Stop, putting a run state back): agents and the person's edit never set it. */
  runState?: TaskRunState
  runStateReason?: string | null
  /** Who made the edit, for the task's activity; a system write (a run state put back) names no one and records nothing. */
  actor?: TaskActor
}) {
  const { taskId, priority, actor, ...rest } = params
  const edit = { title: params.title, description: params.description, priority: priority?.toUpperCase(), labels: params.labels, modelChoice: params.modelChoice, workspaceId: params.workspaceId }
  const recorded = actor !== undefined
  // The task's thread follows its agent (taskThread/lifecycle.ts): read who it was before the change.
  const before = params.assignedAgentId !== undefined || recorded
    ? await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgentId: true, title: true, description: true, priority: true, labels: true, modelChoice: true, workspaceId: true } })
    : null
  const result = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...rest,
      ...(params.runState !== undefined && withExecutionState({ runState: params.runState, runStateReason: params.runStateReason })),
      ...(priority !== undefined && { priority: priority.toUpperCase() as any }),
    } as any,
  })
  if (params.runState !== undefined) await notifyBoardsOfTasks([taskId])

  triggerSnapshotPush()
  if (before && recorded) {
    const fields = changedFields(before, edit)
    const assigned = before.assignedAgentId !== result.assignedAgentId
    await recordTaskActivity([
      ...(fields.length > 0 ? [{ taskId, kind: 'EDITED' as const, actor: actor ?? null, detail: { fields } }] : []),
      ...(assigned ? [{ taskId, kind: 'ASSIGNED' as const, actor: actor ?? null, detail: { fromAgentId: before.assignedAgentId, toAgentId: result.assignedAgentId } }] : []),
    ])
  }
  if (before && before.assignedAgentId !== result.assignedAgentId) {
    await taskLeadChanged([taskId], before.assignedAgentId, result.assignedAgentId)
  }

  return result
}

/**
 * Deletes a task, and its conversation with it (`taskSessionDeletion.ts`): on the site first, then hq's copy in the
 * same transaction as the task, so nothing of it is left to read. Anyone still in its rooms leaves them.
 */
export async function deleteTask(taskId: string) {
  if ((await prisma.agentSession.count({ where: { taskId } })) > 0) {
    const fallbackSiteId = await resolveSiteIdForTask(taskId).catch(() => null)
    await deleteTaskSessionsOnSites({ taskId }, fallbackSiteId)
  }
  // Its runs' results are kept as long as the task, and go with it.
  const [, , result] = await prisma.$transaction([
    prisma.agentSession.deleteMany({ where: { taskId } }),
    prisma.runResult.deleteMany({ where: { taskId } }),
    prisma.task.delete({ where: { id: taskId } }),
  ])
  await taskDeleted(taskId)
  await removeTaskAttachmentFolders([taskId])
  triggerSnapshotPush()
  void leaveRoomsNoLongerAllowed()
  return result
}
