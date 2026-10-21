import { type GetExecutionSites, type DescribeExecutionSite } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import type { SiteDescribeResult } from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from './channel'
import { assertFleetAdmin } from './assertAdmin'
import { entitledProjectsFilter } from '../projects/membership'
import { displaySiteName } from '../shared/siteName'

export type ExecutionSiteSummary = {
  id: string
  siteId: string
  /** As shown (`displaySiteName`). */
  label: string
  status: string
  registeredAt: Date
  lastSeenAt: Date | null
  projectCount: number
  isDefault: boolean
}

/**
 * Readable by any authenticated user — the site picker on project creation needs
 * it, and it carries nothing sensitive: no version and no address (those are a fleet admin's, spec §10). credentialHash/credentialPrefix are
 * excluded by an explicit select rather than by trusting every caller to drop
 * them.
 */
export const getExecutionSites: GetExecutionSites<void, ExecutionSiteSummary[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const rows = await context.entities.ExecutionSite.findMany({
    select: {
      id: true, siteId: true, label: true, status: true,
      registeredAt: true, lastSeenAt: true, isDefault: true,
      // Only the projects this person may open: a count that included a private
      // project would tell them one exists on this site (SC-402).
      _count: { select: { projects: { where: entitledProjectsFilter(context.user.id) } } },
    },
    orderBy: { registeredAt: 'asc' },
  })
  return rows.map(({ _count, ...row }) => ({ ...row, label: displaySiteName(row), projectCount: _count.projects }))
}

/**
 * Asks a connected site to describe itself, for a fleet admin. Deliberately not a stored value:
 * the point is to prove the channel is live right now, which a cached row
 * cannot do.
 */
export const describeExecutionSite: DescribeExecutionSite<
  { siteId: string },
  SiteDescribeResult
> = async ({ siteId }, context) => {
  // The answer names the site's software and its protocol version: for fleet admins only (host-management spec §10).
  await assertFleetAdmin(context)

  try {
    return await siteChannelRegistry.request(siteId, 'site.describe', {})
  } catch (err) {
    // A site being offline is a state of the world, not a server fault — 409 so
    // the page can say so plainly instead of showing an error box.
    if (err instanceof ChannelRequestFailed) throw new HttpError(409, err.message)
    throw err
  }
}
