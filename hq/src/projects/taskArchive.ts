/**
 * Archiving a task and bringing it back. An archived task leaves the lists and its conversation is archived with it
 * (taskThread/lifecycle.ts); unarchiving puts the task back where it was, and its conversation stays archived until
 * someone opens it. Re-exported from taskService.
 */
import { prisma } from 'wasp/server'
import { taskArchived } from '../conversations/taskThread/lifecycle'
import { notifyBoardsOfTasks } from './boardNotify'
import { recordTaskActivity, type TaskActor } from './taskActivity'

/** `actor` null: HQ archived it (the finished-task sweep). */
export async function archiveTask(taskId: string, actor: TaskActor = null) {
  const result = await prisma.task.update({ where: { id: taskId }, data: { archived: true } })
  await recordTaskActivity({ taskId, kind: 'ARCHIVED', actor })
  await taskArchived(taskId)
  return result
}

/** A task not archived is left as it is, and nothing is recorded. */
export async function unarchiveTask(taskId: string, actor: TaskActor) {
  const { count } = await prisma.task.updateMany({ where: { id: taskId, archived: true }, data: { archived: false } })
  if (count === 1) {
    await recordTaskActivity({ taskId, kind: 'UNARCHIVED', actor })
    await notifyBoardsOfTasks([taskId])
  }
  return prisma.task.findUniqueOrThrow({ where: { id: taskId } })
}
