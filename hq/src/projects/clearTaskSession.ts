import { type ClearTaskSession } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { requireTaskAccess } from './resourceEntitlement'

export const clearTaskSession: ClearTaskSession<{ taskId: string }, void> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, "Clearing this task's session")

  const task = await context.entities.Task.findUnique({
    where: { id: taskId },
    select: { id: true, runState: true },
  })
  if (!task) throw new HttpError(404, 'Task not found')
  if (task.runState === 'RUN_ACTIVE') throw new HttpError(400, 'Cannot clear context while task is running')

  // @SC-346 — SITE-FIRST: the site-held session (runs + transcript + tool
  // calls) is deleted before hq's own copy.
  const siteId = await dispatchService.resolveSiteIdForTask(taskId)
  try {
    await siteRuntimeStore.deleteSessionsBy(siteId, { taskId })
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  await context.entities.AgentSession.deleteMany({ where: { taskId } })
}
