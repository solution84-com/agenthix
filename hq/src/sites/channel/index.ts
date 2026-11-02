import type { Server as HttpServer } from 'node:http'
import { authenticateSite, siteExists } from '../registrationService'
import { replacedSiteAt } from '../../fleet/replacedSite'
import { SiteChannelRegistry } from './siteChannelRegistry'
import { prismaSiteStatusStore } from './siteStatusStore'
import { attachSiteChannel } from './siteChannelServer'
import { handleSiteEvent } from './siteEventHandler'
import { reconcileSite } from '../../agents/reconcileService'
import { reconcileDanglingSessions } from '../../sessions/danglingSessionReconciler'
import { taskRunner } from '../../agents/TaskRunner'
import { deliverHeldInstructions } from '../heldInstructions'
import { reconcileSiteNotifications, startSiteNotifications } from '../siteNotifications'
import { reconcileAfterRestore } from '../restoreReconcile'
import { relayAssigner } from '../../relays/assigner'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('SiteChannel')

/**
 * The one live registry, shared by the socket server and by any query that
 * needs to reach a site. Same process, so a module-level singleton is the
 * whole of it.
 */
export const siteChannelRegistry = new SiteChannelRegistry(prismaSiteStatusStore)

/**
 * Reconcile-on-reconnect wiring (plan 5d-2 task 9a): fires once a site's
 * socket authenticates, AFTER `siteChannelServer`'s registry.add has
 * completed. `reconcileSite` synthesizes `run.status` frames for whatever
 * finished while this site was offline (feeding them through the exact same
 * `handleSiteEvent` path a live frame takes, so every side effect — including
 * the task-machine listener — fires identically); `drainHeldTasks` then
 * re-runs whatever `stepToRunning` parked QUEUED with the "held for
 * reconnect" reason after a prior dispatch found the site unreachable.
 *
 * This module importing `agents/TaskRunner` (which itself imports
 * `onRunStatus` from `siteEventHandler` in THIS module) closes a cycle —
 * documented and accepted in `reconcileService.ts`'s own header comment:
 * every binding across it resolves at call time, not module-load time, which
 * is what makes a cycle benign here.
 *
 * @SC-346 (task 10): `reconcileDanglingSessions` runs after `reconcileSite`
 * completes, not folded into it — it checks hq's `AgentSession` copies
 * against this site regardless of task state (reconcileSite is task-scoped),
 * and a failure in one must never block the other. Chained after
 * `drainHeldTasks` rather than raced alongside it so the channel isn't asked
 * to do session-list-sized work at the exact moment it also has held tasks
 * to re-dispatch. Each stage runs inside its own try/catch: the three still
 * run in this order, but a rejection in one is logged and does not prevent
 * the next stage from running.
 *
 * Held instructions (membership ending — heldInstructions.ts) are sent
 * alongside, not in the chain: none of the three stages depends on them, and
 * the site takes its time over each (it stops runs and deletes homes), which
 * must not hold up the task sweep. They are sent in their own order, one pass
 * per site at a time, and `deliverHeldInstructions` never throws.
 */
function onSiteConnected(siteId: string): void {
  void deliverHeldInstructions(siteId)
  // The relay its file line goes to, with a pass; first, so files open as soon as the site is back (adr-0153).
  void relayAssigner.onSiteConnected(siteId)
  // After a restore, of the site or of HQ: what was lost, and what HQ takes back (host-management spec §12).
  reconcileAfterRestore(siteId).catch(err => logger.error(`reconcileAfterRestore failed for site ${siteId}:`, err))
  // A site back on a matching version clears its upgrade, not-connected and HQ-site notifications.
  void reconcileSiteNotifications()
  // Branches' working copies asked to go while it was away are asked again (branches/copies.ts). Loaded when
  // first needed: branch work reaches the channel itself, and a static import would be a cycle.
  void import('../../branches/branchBack').then(m => m.retryCopyRemovals(siteId))
    .catch(err => logger.error(`retryCopyRemovals failed for site ${siteId}:`, err))
  void (async () => {
    try {
      await reconcileSite(siteId, (sid, e) => handleSiteEvent(sid, 'run.status', e))
    } catch (err) {
      logger.error(`reconcileSite failed for site ${siteId}:`, err)
    }

    try {
      await taskRunner.drainHeldTasks(siteId)
    } catch (err) {
      logger.error(`drainHeldTasks failed for site ${siteId}:`, err)
    }

    try {
      await reconcileDanglingSessions(siteId)
    } catch (err) {
      logger.error(`reconcileDanglingSessions failed for site ${siteId}:`, err)
    }
  })()
}

export function startSiteChannel(server: HttpServer): void {
  startSiteNotifications()
  attachSiteChannel(server, {
    registry: siteChannelRegistry,
    authenticate: (siteId, credential) => authenticateSite(siteId, credential),
    siteExists,
    replacedAt: replacedSiteAt,
    recordProtocolVersion: (siteId, version) => prismaSiteStatusStore.recordProtocolVersion(siteId, version),
    // A site that needs upgrading is told to admins at once.
    markVersionMismatch: async (siteId, version, attemptedAt) => {
      await prismaSiteStatusStore.markVersionMismatch(siteId, version, attemptedAt)
      void reconcileSiteNotifications()
    },
    onSiteEvent: handleSiteEvent,
    onSiteConnected,
  })
}

export { ChannelRequestFailed } from './pendingRequests'
export { markAllOfflineAtBoot } from './siteStatusStore'
