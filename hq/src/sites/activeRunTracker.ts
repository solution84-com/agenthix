import { onRunStatus } from './channel/siteEventHandler'
import { sessionOwnedBy } from './channel/sessionOwnerSite'
import { trackRunStatus } from './activeRuns'

/**
 * Feeds `activeRuns` from `run.status` frames. A frame counts only from the
 * site that owns its session — the same check the frame's other side effects
 * pass — so one site cannot name another's session and have its run announced
 * as failed when the first is revoked.
 */
export function registerActiveRunTracker(): void {
  onRunStatus('active-run-tracker', async (e, siteId) => {
    if (await sessionOwnedBy(e.sessionId, siteId)) trackRunStatus(e, siteId)
  })
}
