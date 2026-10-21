import { type ClearTaskSession } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { expirePreviewsForSessions } from '../preview/previewRegistry'
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
  // Read before the delete, because the preview rows are found by the session
  // ids and nothing cascades to them: `PreviewSession.sessionId` carries no
  // relation, so a deleted session leaves its previews resolving.
  const cleared = await context.entities.AgentSession.findMany({ where: { taskId }, select: { id: true } })
  await expirePreviewsForSessions(cleared.map((s: { id: string }) => s.id))
  await context.entities.AgentSession.deleteMany({ where: { taskId } })
}
