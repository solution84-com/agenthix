/**
 * Sites and capacity (live preview spec section 5): each site's *Live previews on this site*, its limit and idle stop,
 * how full it is, and which sites a live preview may start on now. HQ picks the workspace's own site when it allows
 * live previews and has room; else the allowed site with the most room. The person may pick another allowed site with
 * room. A site with live previews off, out of HQ's reach, or whose guard has not reported in a minute is never offered.
 */
import { prisma } from 'wasp/server'
import {
  GUARD_REPORT_STALE_MS, LIVE_PREVIEW_IDLE_MINUTES_DEFAULT, parseLivePreviewIdleMinutes, parseLivePreviewLimit,
  parseSiteHealth, type LivePreviewLimit, type LivePreviewsCapacity, type SiteLivePreviewsParams,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { LIVE } from './store'

export type SiteSetting = SiteLivePreviewsParams

type SettingRow = { livePreviewsAllowed: boolean; livePreviewLimit: number | null; livePreviewIdleMinutes: number }

/** hq's own record of a site's setting; a limit or idle time that is not one reads as the default. */
export function settingOf(row: SettingRow): SiteSetting {
  return {
    allowed: row.livePreviewsAllowed,
    limit: parseLivePreviewLimit(row.livePreviewLimit) ?? null,
    idleMinutes: parseLivePreviewIdleMinutes(row.livePreviewIdleMinutes) ?? LIVE_PREVIEW_IDLE_MINUTES_DEFAULT,
  }
}

export const SITE_SELECT = {
  id: true, siteId: true, label: true, health: true, status: true,
  livePreviewsAllowed: true, livePreviewLimit: true, livePreviewIdleMinutes: true,
} as const

export type SiteRow = { id: string; siteId: string; label: string; health: unknown; status: string } & SettingRow

/** What the site last said its live previews use; null before it said anything. */
export function capacityOf(health: unknown): LivePreviewsCapacity | null {
  return (health ? parseSiteHealth(health)?.livePreviews : null) ?? null
}

export async function guardReportedRecently(executionSiteId: string, now = Date.now()): Promise<boolean> {
  const row = await prisma.livePreviewGuardReport.findUnique({ where: { executionSiteId } })
  return !!row && now - row.at.getTime() <= GUARD_REPORT_STALE_MS
}

/** A site as a live preview's place: its name, whether one may start there now, and how full it is. */
export type SiteChoice = {
  executionSiteId: string
  siteId: string
  name: string
  open: number
  limit: LivePreviewLimit
  /** Why none may start there now, in a sentence; null when one may. */
  blocked: string | null
  isWorkspaceSite: boolean
}

function roomOf(c: Pick<SiteChoice, 'open' | 'limit'>): number {
  return c.limit === null ? Number.POSITIVE_INFINITY : c.limit - c.open
}

export function hasRoom(c: Pick<SiteChoice, 'open' | 'limit'>): boolean {
  return roomOf(c) > 0
}

async function choiceOf(site: SiteRow, workspaceSiteId: string, open: number): Promise<SiteChoice> {
  const setting = settingOf(site)
  let blocked: string | null = null
  if (!siteChannelRegistry.isOnline(site.siteId)) blocked = `${site.label} isn't connected to HQ now.`
  else if (!(await guardReportedRecently(site.id))) blocked = `${site.label}'s guard hasn't reported in the last minute, so no live preview starts there.`
  return {
    executionSiteId: site.id, siteId: site.siteId, name: site.label, open, limit: setting.limit, blocked,
    isWorkspaceSite: site.id === workspaceSiteId,
  }
}

/** Every site with live previews on, as places a live preview may run: the workspace's own first, then by room. */
export async function siteChoices(workspaceSiteId: string): Promise<SiteChoice[]> {
  const sites = await prisma.executionSite.findMany({
    where: { livePreviewsAllowed: true, status: { not: 'REVOKED' } }, select: SITE_SELECT,
  })
  if (sites.length === 0) return []
  const counts = await prisma.livePreview.groupBy({
    by: ['executionSiteId'], where: { executionSiteId: { in: sites.map(s => s.id) }, state: { in: LIVE } }, _count: { _all: true },
  })
  const open = new Map(counts.map(c => [c.executionSiteId, c._count._all]))
  const choices = await Promise.all(sites.map(s => choiceOf(s, workspaceSiteId, open.get(s.id) ?? 0)))
  return choices.sort((a, b) =>
    Number(b.isWorkspaceSite) - Number(a.isWorkspaceSite) || roomOf(b) - roomOf(a) || a.name.localeCompare(b.name))
}

/** HQ's pick: the workspace's own site when it may and has room, else the open site with the most room; null for none. */
export function pickSite(choices: SiteChoice[]): SiteChoice | null {
  const usable = choices.filter(c => !c.blocked && hasRoom(c))
  return usable.find(c => c.isWorkspaceSite) ?? [...usable].sort((a, b) => roomOf(b) - roomOf(a))[0] ?? null
}

export async function siteSetting(executionSiteId: string): Promise<(SiteSetting & { name: string; siteId: string }) | null> {
  const row = await prisma.executionSite.findUnique({ where: { id: executionSiteId }, select: SITE_SELECT })
  return row && row.status !== 'REVOKED' ? { ...settingOf(row), name: row.label, siteId: row.siteId } : null
}
