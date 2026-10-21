/**
 * Applies where a departing person's open tasks go in one project (every
 * screen reviewed spec §3, People; adr-0089): handed to another member, or
 * left waiting, blocked until someone takes them on. A run in progress
 * finishes first either way. Their routines there pause, as on any loss of
 * access, until a project admin takes them over.
 *
 * `checkOpenTasksDestination` runs before the person leaves, so a refused
 * choice changes nothing; `handOverOpenTasks` after, once they are gone.
 */
import { HttpError, prisma } from 'wasp/server'
import { mayWorkInProject } from './membership'
import { isActivePerson, personById } from '../server/identity/people'
import { createTaskComment } from './taskStateService'
import { blockTasksForLostAccess } from './lossOfAccess'
import { LOST_ACCESS_REASON } from './taskOnBehalfOf'
import { pauseRoutinesForLostAccess } from '../automation/routines'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import type { OpenTasksDestination } from './openTasksDestination'

/** A task still to be done: not finished and not archived. */
export const OPEN_TASK = { archived: false, status: { not: 'DONE' as const } }

/** How many open tasks are done on this person's behalf, by project. */
export async function openTaskCountsOf(userId: string, projectIds?: string[]): Promise<Map<string, number>> {
  const groups = await prisma.task.groupBy({
    by: ['projectId'],
    where: { ...OPEN_TASK, onBehalfOfUserId: userId, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
    _count: { _all: true },
  })
  return new Map(groups.map(g => [g.projectId, g._count._all]))
}

export async function checkOpenTasksDestination(
  projectId: string,
  fromUserId: string,
  destination: OpenTasksDestination,
): Promise<void> {
  if (destination.kind === 'wait') return
  if (destination.userId === fromUserId) throw new HttpError(400, 'Their open tasks must go to someone else')
  if (!(await isActivePerson(destination.userId)) || !(await mayWorkInProject(projectId, destination.userId))) {
    throw new HttpError(400, 'Their open tasks can only go to someone who works in this project, not a Viewer')
  }
}

export async function handOverOpenTasks(args: {
  projectId: string
  fromUserId: string
  destination: OpenTasksDestination
  actorId: string
}): Promise<{ moved: number; waiting: number }> {
  const { projectId, fromUserId, destination, actorId } = args
  // A run they started on someone else's task goes back to being that task's person's.
  await prisma.task.updateMany({
    where: { projectId, runOnBehalfOfUserId: fromUserId, onBehalfOfUserId: { not: fromUserId } },
    data: { runOnBehalfOfUserId: null },
  })
  if (destination.kind === 'wait') {
    const waiting = await blockTasksForLostAccess({ projectId, onBehalfOfUserId: fromUserId }, { stopActiveRuns: false })
    return { moved: 0, waiting }
  }

  await pauseRoutinesForLostAccess({ projectId, onBehalfOfUserId: fromUserId })
  const tasks = await prisma.task.findMany({
    where: { ...OPEN_TASK, projectId, onBehalfOfUserId: fromUserId },
    select: { id: true, boardId: true, runState: true, runStateReason: true },
  })
  if (tasks.length === 0) return { moved: 0, waiting: 0 }
  const blockedForLostAccess = tasks.filter(t => t.runState === 'RUN_BLOCKED' && t.runStateReason === LOST_ACCESS_REASON)
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { id: { in: tasks.map(t => t.id) } },
      data: { onBehalfOfUserId: destination.userId, runOnBehalfOfUserId: null },
    }),
    // Released to no run pending, as choosing someone else on a task does (onBehalfOfOperations.ts).
    prisma.task.updateMany({
      where: { id: { in: blockedForLostAccess.map(t => t.id) } },
      data: { runState: 'RUN_NONE', runStateReason: null },
    }),
  ])
  const name = (await personById(destination.userId)).name
  for (const task of tasks) {
    await createTaskComment({ taskId: task.id, authorType: 'USER', userId: actorId, content: `This task is now done on behalf of ${name}.` })
  }
  const { emitTaskUpdated } = await import('../server/socket')
  for (const boardId of new Set(tasks.map(t => t.boardId).filter((id): id is string => id !== null))) emitTaskUpdated(boardId)
  triggerSnapshotPush()
  return { moved: tasks.length, waiting: 0 }
}
