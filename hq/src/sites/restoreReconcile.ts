/**
 * HQ's side of reconciling after a restore (host-management spec §12): each time a site connects, HQ asks what it
 * holds (`site.restoreReport`, core's siteRestore.ts) and compares it with its own placements. A restored site:
 * HQ tells its organisation admins what was lost, once per restore. A restored HQ — the host service that restored
 * it sets `HQ_RESTORED_FROM` — takes back the workspaces the site holds whose owner it knows and had placed on that
 * same site, and tells its organisation admins about the rest. Only then: otherwise a site could claim a workspace
 * HQ never placed.
 */
import { prisma } from 'wasp/server'
import { SITE_RESTORE_METHODS, parseSiteRestoreReport, type SiteRestoreWorkspace } from '@agenthix/core'
import { siteChannelRegistry } from './channel'
import { recordPlacement } from '../storage/workspaceStore'
import { displaySiteName } from '../shared/siteName'
import { Logger } from '../server/utils/logger'
import { compareRestore, restoredNotice, unrecognisedNotice } from './restoreCompare'
import { SITES_PAGE_URL } from './siteNotifications'
import { notificationsChanged } from '../server/personEvents'

const logger = new Logger('RestoreReconcile')
const REPORT_TIMEOUT_MS = 60_000

export const RESTORE_NOTIFICATION_TYPES = { restored: 'site_restored', unrecognised: 'site_unrecognised' } as const

async function orgAdmins(): Promise<string[]> {
  const rows = await prisma.userSettings.findMany({
    where: { role: 'ADMIN', user: { deactivatedAt: null, erasedAt: null } },
    select: { userId: true },
  })
  return rows.map(r => r.userId)
}

/** Once per subject: a notice already raised for it is not raised again. */
async function tellAdminsOnce(type: string, subjectKey: string, notice: { title: string; body: string }): Promise<void> {
  if (await prisma.notification.findFirst({ where: { type, subjectKey }, select: { id: true } })) return
  const admins = await orgAdmins()
  if (admins.length === 0) return
  await prisma.notification.createMany({
    data: admins.map(userId => ({ userId, type, subjectKey, ...notice, actionLabel: 'Open Sites', actionUrl: SITES_PAGE_URL })),
  })
  notificationsChanged(admins)
}

/** Owners HQ knows that live on this site: a project placed there, or a person whose own storage is there. */
async function ownersHere(siteRowId: string, workspaces: SiteRestoreWorkspace[]): Promise<(w: SiteRestoreWorkspace) => boolean> {
  const projectIds = workspaces.filter(w => w.ownerType === 'project').map(w => w.ownerId)
  const userIds = workspaces.filter(w => w.ownerType === 'user').map(w => w.ownerId)
  const [projects, users] = await Promise.all([
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds }, executionSiteId: siteRowId }, select: { id: true } }) : [],
    userIds.length ? prisma.userStoragePlacement.findMany({ where: { userId: { in: userIds }, siteId: siteRowId }, select: { userId: true } }) : [],
  ])
  const known = new Set([...projects.map(p => `project:${p.id}`), ...users.map(u => `user:${u.userId}`)])
  return w => known.has(`${w.ownerType}:${w.ownerId}`)
}

/** Set by the host service when it restored this HQ from a backup; when that backup was taken. */
const hqRestoredFrom = () => process.env.HQ_RESTORED_FROM?.trim() || null

export async function reconcileAfterRestore(siteId: string): Promise<void> {
  if (!siteChannelRegistry.isOnline(siteId)) return
  const site = await prisma.executionSite.findUnique({ where: { siteId }, select: { id: true, label: true, isDefault: true } })
  if (!site) return
  const report = parseSiteRestoreReport(await siteChannelRegistry.request(siteId, SITE_RESTORE_METHODS.report, {}, REPORT_TIMEOUT_MS))
  if (!report) {
    logger.warn(`site ${siteId} answered site.restoreReport with something it does not read`)
    return
  }
  const placed = await prisma.workspacePlacement.findMany({ where: { siteId: site.id }, select: { workspaceId: true } })
  const result = compareRestore(report, placed.map(p => p.workspaceId), await ownersHere(site.id, report.workspaces))
  const name = displaySiteName(site)

  if (report.restored) {
    await tellAdminsOnce(RESTORE_NOTIFICATION_TYPES.restored, `${site.id}:${report.restored.takenAt}`, restoredNotice(name, report.restored, result.lost.length))
  }
  if (!hqRestoredFrom()) return
  for (const w of result.takeBack) {
    // Another site may have claimed it first; HQ keeps the first placement it records.
    if (!(await prisma.workspacePlacement.findUnique({ where: { workspaceId: w.id }, select: { workspaceId: true } }))) await recordPlacement(w.id, site.id)
  }
  if (result.unrecognised.length > 0) {
    const ids = result.unrecognised.map(w => w.id).sort().join(',')
    await tellAdminsOnce(RESTORE_NOTIFICATION_TYPES.unrecognised, `${site.id}:${ids}`, unrecognisedNotice(name, result.unrecognised.length, result.takeBack.length))
  }
}
