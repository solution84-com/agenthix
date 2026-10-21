/** A task named by its key (WAL-2, any case) or its id: the one place either becomes the id every check uses. */
import { prisma } from 'wasp/server'
import { ControlPlaneError } from './types'

const TASK_KEY = /^([A-Za-z0-9]+)-(\d+)$/

/** The task's id, from its id or its key as the caller passed it, or why the words name no task. */
export async function taskIdFor(words: string): Promise<{ taskId: string } | { refusal: string }> {
  const given = words.trim()
  const byId = await prisma.task.findUnique({ where: { id: given }, select: { id: true } })
  if (byId) return { taskId: byId.id }
  const match = TASK_KEY.exec(given)
  if (match) {
    const task = await prisma.task.findFirst({
      where: { number: Number(match[2]), project: { key: match[1]!.toUpperCase() } },
      select: { id: true },
    })
    if (task) return { taskId: task.id }
  }
  return { refusal: `There is no task with the key or id "${given}"; list_tasks shows each task's key` }
}

/** The arguments with a `taskId` given as a key replaced by the task's id; any other arguments pass as they came. */
export async function withTaskId<T>(args: T): Promise<T> {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args
  const given = (args as { taskId?: unknown }).taskId
  if (typeof given !== 'string') return args
  const found = await taskIdFor(given)
  if ('refusal' in found) throw new ControlPlaneError('not_found', found.refusal)
  return { ...args, taskId: found.taskId }
}
