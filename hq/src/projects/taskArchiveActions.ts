import { HttpError, prisma } from 'wasp/server'
import { requireTaskAccess } from './resourceEntitlement'
import { archiveTask as archiveTaskRecord, unarchiveTask as unarchiveTaskRecord } from './taskArchive'
import { personActor } from './taskActivity'

type Ctx = { user?: { id: string } | null }

/** A running task is stopped first, as the agents' delete and archive require: its run would go on with no task to report to. */
export async function refuseWhileRunning(taskId: string, what: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { runState: true } })
  if (task?.runState === 'RUN_ACTIVE') {
    throw new HttpError(409, `Cannot ${what} a task that is currently running. Stop it first. Nothing was changed.`)
  }
}

export const archiveTask = async ({ taskId }: { taskId: string }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Archiving this task')
  await refuseWhileRunning(taskId, 'archive')
  return archiveTaskRecord(taskId, personActor(context.user.id))
}

/** Whoever may archive a task may bring it back. */
export const unarchiveTask = async ({ taskId }: { taskId: string }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Unarchiving this task')
  return unarchiveTaskRecord(taskId, personActor(context.user.id))
}
