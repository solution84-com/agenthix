import { prisma } from 'wasp/server'
import { siteChannelRegistry } from './channel'
import { contentChannelRegistry } from './content'
import { taskRunner } from '../agents/TaskRunner'
import { SITE_REVOKED_REASON } from '../agents/taskExecutionReasons'
import { failRunsForRevokedSite } from './activeRuns'
import { reconcileSiteNotifications } from './siteNotifications'

/**
 * Who took the site out: a fleet admin in the Fleet Console or Agenthix Cloud for a site it runs (adr-0115), the
 * machine itself (ADR-0065), or — before the Fleet Console — an admin by their account.
 */
export type SiteRemoval = { byId: string } | { leftByItself: true } | { byFleetConsole: true } | { byCloud: true }

/**
 * Takes a site out of the org, whether an admin revoked it or the site left.
 * The row first: once it reads REVOKED, a reconnect is refused at the handshake
 * (authenticateSite), so closing the live channels cannot race one back in.
 */
export async function revokeSite(siteId: string, removal: SiteRemoval): Promise<void> {
  await prisma.executionSite.update({
    where: { siteId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedById: 'byId' in removal ? removal.byId : null,
      leftByItself: 'leftByItself' in removal,
    },
  })
  // A revoked site never reconnects, so an instruction held for it could never
  // be delivered (heldInstructions.ts).
  await prisma.heldSiteInstruction.deleteMany({ where: { siteId } })
  siteChannelRegistry.revoke(siteId)
  // The content connection is a second socket from the same site.
  contentChannelRegistry.revoke(siteId)
  try {
    // Its runs will never report again, and a revoked site is never reconciled.
    await taskRunner.failTasksForRevokedSite(siteId)
  } finally {
    // After the tasks: a task page refetches when this arrives, and must find the task failed.
    // A chat mid-reply would otherwise show "sending" until the page is reloaded.
    failRunsForRevokedSite(siteId, SITE_REVOKED_REASON)
    // Its own notifications go; a removed site still holding projects is listed, not notified.
    void reconcileSiteNotifications()
  }
}
