import { prisma } from 'wasp/server'
import { parseSiteHealth, type SiteHealth } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { reconcileSiteNotifications } from './siteNotifications'

const logger = new Logger('SiteHealth')

/**
 * A site's `site.health` report (core's siteHealth.ts): checked, stored as the
 * site's latest, and the site notifications brought up to date — Docker down
 * or a nearly full disk raises one, the next good report clears it. A report
 * that does not parse is dropped and the last good one stays.
 */
export async function handleSiteHealthEvent(siteId: string, data: unknown): Promise<void> {
  const health = parseSiteHealth(data)
  if (!health) {
    logger.warn(`site ${siteId}: rejected a malformed site.health report — dropped`)
    return
  }
  await recordSiteHealth(siteId, health)
  await reconcileSiteNotifications()
}

export async function recordSiteHealth(siteId: string, health: SiteHealth): Promise<void> {
  await prisma.executionSite.updateMany({
    where: { siteId, status: { not: 'REVOKED' } },
    data: { health, healthReportedAt: new Date() },
  })
}
