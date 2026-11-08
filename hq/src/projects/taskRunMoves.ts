/**
 * What moving a task does to its run state (agents own schedule spec §6). A
 * task's column is its agent's or a person's to change; its run state is the
 * system's, and a move never changes it except in one way the system applies:
 * into a done column (or off the board), a run that is waiting in its agent's
 * line is withdrawn to RUN_NONE — the work has been decided. A run already
 * going is never touched; its end settles it. No column starts work
 * (adr-0175).
 *
 * The withdrawal is one conditional write, so it applies to the run state the
 * task has at that moment, not to one read earlier.
 */
import { withExecutionState } from './executionState'
import { prisma } from 'wasp/server'
import { notifyBoardsOfTasks } from './boardNotify'
import { notBeforeItsTime } from './notBeforeItsTime'

export { notBeforeItsTime }

/** Withdraws a run waiting in its agent's line. Returns whether there was one. */
export async function withdrawPendingRun(taskId: string): Promise<boolean> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runState: 'RUN_QUEUED' },
    data: { ...withExecutionState({ runState: 'RUN_NONE', runStateReason: null }), runStartedBy: null },
  })
  if (count === 1) await notifyBoardsOfTasks([taskId])
  return count === 1
}

/** The run-state rule for a task that has just landed in a column: what it did, if anything. */
export async function applyMoveToRunState(taskId: string, column: { status: string }): Promise<'withdrawn' | null> {
  if (column.status === 'DONE') return (await withdrawPendingRun(taskId)) ? 'withdrawn' : null
  return null
}
