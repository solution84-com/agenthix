/**
 * The scheduled change a site's row shows an organisation admin (host-management spec §10, §14): the next one on
 * its machine that is still ahead or going. A change to hq itself is the built-in site's too, since it shares hq's
 * machine. Never who scheduled it.
 */
import { prisma } from 'wasp/server'
import type { ScheduledChangeKind } from '@agenthix/core'
import { holdEnds } from './runHold'
import type { ScheduledOnSite } from '../siteViews'

const OPEN = ['scheduled', 'pausing', 'running']

export async function scheduledBySite(sites: { siteId: string; isDefault: boolean }[], now = new Date()): Promise<Map<string, ScheduledOnSite>> {
  const rows = (await prisma.scheduledChange.findMany({ where: { state: { in: OPEN } }, orderBy: { at: 'asc' } }))
    .filter(r => now.getTime() <= holdEnds(r))
  const out = new Map<string, ScheduledOnSite>()
  for (const site of sites) {
    const next = rows.find(r => r.siteId === site.siteId || (site.isDefault && r.siteId === null))
    if (next) out.set(site.siteId, { kind: next.kind as ScheduledChangeKind, at: next.at, expectedMinutes: next.expectedMinutes, detail: next.detail })
  }
  return out
}
