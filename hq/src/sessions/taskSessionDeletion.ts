/**
 * A task's conversation is deleted with the task: its running work stopped, then its session deleted on the site
 * that holds it — transcript, runs and tool-call log with it — and then hq's copy, in the same transaction as the
 * task. Deleting a project does the same for every task in it. Nothing of a deleted task's conversation is left
 * for anyone to read.
 *
 * Site first, as `deleteTaskSession` does: a site that cannot be reached refuses the delete and nothing in hq
 * changes, so the person tries again. A revoked site is skipped: hq can never reach it again, and its sessions'
 * copies in hq still go, so nothing can be read through hq.
 */
import { HttpError } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import * as siteRuntimeStore from './siteRuntimeStore'
import { sessionsBySite, stopRunsOfSessions, RunsNotConfirmedStopped } from '../projects/projectRunStop'
import { SiteUnreachableError } from '../storage/workspaceStore'

/** The task sessions of one task, or of every task in a project. */
export type TaskSessionScope = { taskId: string } | { projectId: string }

/** Prisma's `where` for hq's copies of the sessions in scope. */
export function taskSessionsWhere(scope: TaskSessionScope): Prisma.AgentSessionWhereInput {
  return 'taskId' in scope ? { taskId: scope.taskId } : { task: { projectId: scope.projectId } }
}

/**
 * Stops the running work of the task sessions in scope and deletes them on their sites. hq's copies are the
 * caller's to delete, with the task, once this has returned. Throws an HttpError, having deleted nothing in hq,
 * when a site cannot be reached or the work could not be confirmed stopped. `fallbackSiteId` is asked about a
 * session whose own placement is gone.
 */
export async function deleteTaskSessionsOnSites(scope: TaskSessionScope, fallbackSiteId: string | null): Promise<void> {
  const where = taskSessionsWhere(scope)
  const what = 'taskId' in scope ? "This task's conversation" : "This project's task conversations"
  try {
    await stopRunsOfSessions(where, fallbackSiteId)
  } catch (err) {
    if (err instanceof RunsNotConfirmedStopped) {
      throw new HttpError(err.status, `${what} could not be confirmed stopped: ${err.detail}. Nothing was deleted; try again.`)
    }
    throw err
  }
  for (const [siteId, ids] of await sessionsBySite(where, fallbackSiteId)) {
    try {
      await siteRuntimeStore.deleteSessionsBy(siteId, { ids: [...ids] })
    } catch (err) {
      if (err instanceof SiteUnreachableError && err.revoked) continue
      if (err instanceof SiteUnreachableError) {
        throw new HttpError(503, `${what} is held on a site that cannot be reached (${err.message}), so the delete was refused. Nothing was deleted in HQ; try again once the site is back.`)
      }
      throw err
    }
  }
}
