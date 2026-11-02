/**
 * Site resolution for post-dispatch callers — split out of dispatchService.ts
 * (plan 5d-2 task 9b) to keep that file under the repo's 500-line rule.
 *
 * This module has no import of dispatchService.ts at all.
 * dispatchService.ts re-exports `resolveSiteIdForTask` and
 * `resolveSiteIdForSession` from here so its own
 * namespace-import call sites — TaskRunner.ts, manifestActions.ts,
 * sessions/actions.ts, agents/actions.ts, agentService.ts,
 * settings/actions.ts, projects/actions.ts — keep working unchanged, but
 * that re-export is one-directional and not a cycle.
 */
import { HttpError } from 'wasp/server'
import { resolvePrimaryLocation, type SessionLocationFields } from '../storage/primaryLocationService'
import { resolveExecutionSiteId } from '../server/identity/capabilityService'
import { taskRunOwner } from '../projects/personalProject'
import { previewSiteOfSession, previewSiteOfTask } from '../livePreviews/runs'

/**
 * Resolves the logical siteId a TASK's runs dispatch to, for callers that
 * already know a taskId and need to reach the site WITHOUT minting a fresh
 * capability: the task-machine's own frame-ownership check (TaskRunner.ts)
 * and manifestActions' task-run branch.
 *
 * A task run works in its project's `tasks/{taskId}/` directory (its person's,
 * for a task in Your space) —
 * `dispatchTaskRun` builds exactly this location before it mints — so this
 * lands on the site holding that project's storage, and refuses (rather than
 * guessing a site) when the task is gone.
 */
export async function resolveSiteIdForTask(taskId: string): Promise<string> {
  // The same location dispatchTaskRun builds: a task in Your space works in its
  // person's own storage, any other in its project's, and lands on the site holding that.
  const owner = await taskRunOwner(taskId)
  if (!owner) throw new HttpError(400, `Task ${taskId} not found`)
  // While the task's branch has a live preview on another site, its runs are there (livePreviews/runs.ts).
  const preview = await previewSiteOfTask(taskId)
  if (preview) return preview
  return resolveExecutionSiteId({ ownerType: owner.storage.ownerType, ownerId: owner.storage.ownerId, taskId })
}

/**
 * The same answer for a chat or task SESSION, derived the one way that
 * cannot disagree with the mint: from the session row's own primary location,
 * which is what `resolveCapabilityClaims` is handed at dispatch.
 */
export async function resolveSiteIdForSession(session: SessionLocationFields & { id?: string }): Promise<string> {
  const preview = session.taskId ? await previewSiteOfTask(session.taskId) : session.id ? await previewSiteOfSession(session.id) : null
  if (preview) return preview
  return resolveExecutionSiteId(resolvePrimaryLocation(session))
}
