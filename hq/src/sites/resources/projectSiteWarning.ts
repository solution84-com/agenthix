/**
 * The warning on a project whose site's machine is nearly out of disk or memory (host-management spec §10):
 * "office-server is nearly out of disk; runs may fail. Your fleet admins have been told." A sentence only: the site's
 * health report, with its figures, never leaves hq towards a member.
 */
import { parseSiteHealth, nearlyOutText } from '@agenthix/core'
import { displaySiteName } from '../../shared/siteName'
import { healthShortages } from '../siteStanding'

export type WarnedSite = { id: string; label: string; isDefault: boolean; status: string; health: unknown }

/** Select this for a project's `executionSite`, and hand the row to `projectSiteAsShown`. */
export const WARNED_SITE_SELECT = { id: true, label: true, isDefault: true, status: true, health: true } as const

export function siteWarning(site: WarnedSite): string | null {
  // A report from a site that is away says how it was, not how it is.
  if (site.status !== 'ONLINE') return null
  const health = parseSiteHealth(site.health)
  const short = health ? healthShortages(health) : []
  return short.length > 0 ? nearlyOutText(displaySiteName(site), short) : null
}

/** The project's site as a member is given it: its id, its name as shown and the warning — nothing of its health. */
export function projectSiteAsShown(site: WarnedSite | null): { id: string; label: string; warning: string | null } | null {
  if (!site) return null
  return { id: site.id, label: displaySiteName(site), warning: siteWarning(site) }
}
