/**
 * Reconciling a conversation's work with what is true (conversation layer spec, What "the call carries on" relies
 * on; Failure, recovery and observability). Events that were lost while hq was down, or while a site's channel
 * was, are made up from the authoritative status, and applied through the paths the live events take, so a repeat
 * changes nothing:
 *
 * - when a site connects (after hq starts, every site dials in again): its workers' briefs and its tasks' runs;
 * - at hq's start and every lease after (coordinator/recovery.ts): the lead's own calls cut by a restart, and task
 *   operations stranded by a change on their task's board.
 */
import { SiteUnreachableError } from '../../../storage/workspaceStore'
import { Logger } from '../../../server/utils/logger'
import { reconcileWorkersOn } from './workers'
import { reconcileTasksOn } from './tasks'

export { reconcileUncertainCalls, callReconcileDeps } from './calls'
export { reconcileStrandedTaskOperations } from './tasks'

const logger = new Logger('ConversationReconcile')

/** On a site's connect, after its task runs are reconciled: the conversations' work there. Never throws. */
export async function reconcileSiteWork(siteId: string): Promise<void> {
  for (const [what, sweep] of [['workers', reconcileWorkersOn], ['tasks', reconcileTasksOn]] as const) {
    try {
      await sweep(siteId)
    } catch (err) {
      if (err instanceof SiteUnreachableError) {
        logger.warn(`reconciling conversations' work on site ${siteId} stopped: the site went away again`)
        return
      }
      logger.error(`could not reconcile conversations' ${what} on site ${siteId}`, err)
    }
  }
}
