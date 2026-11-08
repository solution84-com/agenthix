/**
 * What moving a task does to its run state (agents own schedule spec §6). A
 * task's column is its agent's or a person's to change; its run state is the
 * system's, and a move never changes it except in two ways the system applies:
 *
 *   - into a column that queues automatically, a run is queued for the pulse —
 *     only if none is pending, failed or blocked (RUN_NONE) — at the depth of
 *     whoever moved it (adr-0091), throttled where the boundary throttles;
 *   - into a done column (or off the board), a run that is queued or throttled
 *     is withdrawn to RUN_NONE: the work has been decided. A run already going
 *     is never touched; its end settles it.
 *
 * Each is one conditional write, so it applies to the run state the task has at
 * that moment, not to one read earlier.
 *
 * A column never queues a task that has no agent: nothing could run it, so it waits as it is.
 *
 * A column never starts a task early (spec §3): one whose start time or round
 * time is still to come is not queued by landing in a column. At that time it
 * starts, then.
 */
import { withExecutionState } from './executionState'
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { Queuer } from './taskOnBehalfOf'
import { queuedForPulse } from './taskQueueing'
import { notifyBoardsOfTasks } from './boardNotify'
import { notBeforeItsTime } from './notBeforeItsTime'

export { notBeforeItsTime }

/** Withdraws a queued or throttled run. Returns whether there was one. */
export async function withdrawPendingRun(taskId: string): Promise<boolean> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] } },
    data: { ...withExecutionState({ runState: 'RUN_NONE', runStateReason: null }), runStartedBy: null },
  })
  if (count === 1) await notifyBoardsOfTasks([taskId])
  return count === 1
}

/**
 * Queues a run, for the pulse, of a task that is not an epic, has none pending, failed or blocked, has an agent, and whose time
 * has come. A task with no agent stays as it is — nothing could ever run it. Returns whether it did.
 */
export async function queueRunIfNone(taskId: string, queuer: Queuer | null, depth = 0): Promise<boolean> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (!task) return false
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runState: 'RUN_NONE', assignedAgentId: { not: null }, isEpic: false, ...notBeforeItsTime(new Date()) },
    data: await queuedForPulse(task.projectId, queuer, depth),
  })
  if (count === 1) await notifyBoardsOfTasks([taskId])
  return count === 1
}

/** The run-state rule for a task that has just landed in a column: what it did, if anything. */
export async function applyMoveToRunState(
  taskId: string,
  column: { status: string; autoQueue: boolean },
  opts: { suppressAutoQueue?: boolean; queuer: Queuer | null; depth?: number },
): Promise<'queued' | 'withdrawn' | null> {
  if (column.status === 'DONE') return (await withdrawPendingRun(taskId)) ? 'withdrawn' : null
  if (column.autoQueue && !opts.suppressAutoQueue) return (await queueRunIfNone(taskId, opts.queuer, opts.depth ?? 0)) ? 'queued' : null
  return null
}
