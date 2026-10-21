/**
 * `hq.about` and `site.loads` (core's hqFacts.ts): what the Fleet Console's screens show of hq — the organisation's
 * name, the address people open HQ at, and each connected site's runs. Nothing an organisation admin does not already
 * see in HQ: the name is on every page, and a site's runs are on *Where work runs*.
 */
import { prisma } from 'wasp/server'
import { parseSiteHealth, type HqAbout, type SiteLoad } from '@agenthix/core'
import { readOrgCard } from '../org/publicIdentity'
import { hqAddress } from '../auth/hqLinks'

export async function hqAbout(): Promise<HqAbout> {
  return { organisationName: (await readOrgCard()).name, address: hqAddress() }
}

export type SiteLoadRow = { id: string; isDefault: boolean; status: string; health: unknown; healthReportedAt: Date | null }

/** Only a site connected now, with a health report in its shape: a run count from a site that is away is not one. */
export function siteLoadsOf(rows: SiteLoadRow[]): SiteLoad[] {
  return rows.flatMap(r => {
    const health = r.status === 'ONLINE' ? parseSiteHealth(r.health) : null
    if (!health || !r.healthReportedAt) return []
    return [{
      executionSiteId: r.id,
      isDefault: r.isDefault,
      running: health.runs.running,
      maxAtOnce: health.runs.maxAtOnce,
      reportedAt: r.healthReportedAt.toISOString(),
    }]
  })
}

export async function siteLoads(): Promise<{ sites: SiteLoad[] }> {
  const rows = await prisma.executionSite.findMany({
    where: { status: 'ONLINE' },
    select: { id: true, isDefault: true, status: true, health: true, healthReportedAt: true },
  })
  return { sites: siteLoadsOf(rows) }
}
