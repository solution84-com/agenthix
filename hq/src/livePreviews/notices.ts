/**
 * Who is told what about live previews (live preview spec sections 4 to 6): the person who started one, when someone
 * else stopped it or the guard acted; and the fleet admins, when the guard acts on one of their sites, when a site's
 * memory passes 80% and when it is back, and when a live preview was stopped because its machine ran out. Fleet admins
 * are told whose live preview and which branch, never what was in it. Memory is told once per crossing: hq keeps which
 * band each site was last in.
 */
import { prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import { LIVE_PREVIEWS_MEMORY_HIGH_PERCENT, memoryBand, type LivePreviewsCapacity } from '@agenthix/core'
import { fleetAdminIds } from '../fleet/fleetAdminRole'
import { notificationsChanged } from '../server/personEvents'
import { personById } from '../server/identity/people'
import {
  FLEET_LIVE_PREVIEW_GUARD, FLEET_LIVE_PREVIEW_STOPPED_FOR_RESOURCES, FLEET_SITE_MEMORY_HIGH, FLEET_SITE_MEMORY_RECOVERED,
  LIVE_PREVIEW_NOTIFICATION,
} from './noticeKinds'

/** Where a notice opens: the workspace view on the live preview's branch. */
export function livePreviewLink(row: Pick<LivePreview, 'workspaceId' | 'branch'>): string {
  return `/workspaces/${encodeURIComponent(row.workspaceId)}/view?branch=${encodeURIComponent(row.branch)}&section=preview`
}

export async function tellPerson(row: Pick<LivePreview, 'userId' | 'workspaceId' | 'branch'>, title: string, body: string): Promise<void> {
  await prisma.notification.create({
    data: { userId: row.userId, type: LIVE_PREVIEW_NOTIFICATION, title, body, actionLabel: 'Open', actionUrl: livePreviewLink(row) },
  })
  notificationsChanged([row.userId])
}

async function toFleetAdmins(type: string, title: string, body: string, subjectKey: string | null): Promise<void> {
  const ids = await fleetAdminIds()
  if (!ids.length) return
  await prisma.notification.createMany({ data: ids.map(userId => ({ userId, type, title, body, subjectKey })) })
  notificationsChanged(ids)
}

/** Someone other than its starter stopped it: they are told who, and that their work is untouched. */
export async function tellStoppedBy(row: LivePreview, who: string): Promise<void> {
  await tellPerson(row, `Your live preview of ${row.branch} was stopped`,
    `${who} stopped it. Its branch and its work are untouched; start it again from Live preview when you want it.`)
}

/** The guard acted: the person who started it, and the fleet admins of the site. */
export async function tellGuard(row: LivePreview | null, siteName: string, hostId: string | null, found: string, done: string): Promise<void> {
  if (row) {
    await tellPerson(row, `The guard ${done} on your live preview of ${row.branch}`,
      `On ${siteName}, it found ${found}. Read what it found in the workspace view before you go on.`)
  }
  const where = row ? `, in the live preview of ${row.branch} in ${row.workspaceName ?? 'a workspace'}` : ''
  await toFleetAdmins(FLEET_LIVE_PREVIEW_GUARD, `The guard on ${siteName} ${done}`, `It found ${found}${where}.`, hostId)
}

export async function tellStoppedForResources(row: LivePreview, siteName: string, hostId: string | null): Promise<void> {
  await tellPerson(row, `Your live preview of ${row.branch} was stopped`,
    `${siteName} ran out of memory, so it was stopped to keep the machine running. Its branch and its work are untouched.`)
  const person = await personById(row.userId)
  await toFleetAdmins(FLEET_LIVE_PREVIEW_STOPPED_FOR_RESOURCES, `A live preview on ${siteName} was stopped: the machine ran out of memory`,
    `It was ${person.name}'s live preview of ${row.branch} in ${row.workspaceName ?? 'a workspace'}. They were told why.`, hostId)
}

/** A site's health report: the fleet admins are told when its memory crosses into the high band, and when it leaves. */
export async function watchMemory(siteId: string, capacity: LivePreviewsCapacity | undefined): Promise<void> {
  if (!capacity) return
  const site = await prisma.executionSite.findFirst({
    where: { siteId, status: { not: 'REVOKED' } }, select: { id: true, label: true, relayHostId: true, livePreviewsMemoryHigh: true },
  })
  if (!site) return
  const was = site.livePreviewsMemoryHigh ? 'high' : 'normal'
  const now = memoryBand(was, capacity.memoryPercent)
  if (now === was) return
  // Moved only while it still reads the band it was in, so two reports at once tell the admins once.
  const { count } = await prisma.executionSite.updateMany({
    where: { id: site.id, livePreviewsMemoryHigh: was === 'high' }, data: { livePreviewsMemoryHigh: now === 'high' },
  })
  if (!count) return
  const open = `${capacity.open} live ${capacity.open === 1 ? 'preview' : 'previews'} open`
  if (now === 'high') {
    await toFleetAdmins(FLEET_SITE_MEMORY_HIGH, `${site.label} is using ${capacity.memoryPercent}% of its memory`,
      `It passed ${LIVE_PREVIEWS_MEMORY_HIGH_PERCENT}% with ${open}. If it runs out, a live preview is stopped to keep it running. You can stop live previews, or set a limit, on its page in the Fleet Console.`,
      site.relayHostId)
  } else {
    await toFleetAdmins(FLEET_SITE_MEMORY_RECOVERED, `${site.label}'s memory is back to ${capacity.memoryPercent}%`, `It has ${open}.`, site.relayHostId)
  }
}
