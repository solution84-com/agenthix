/**
 * Members whose projects run on a site whose machine is nearly out of disk or memory are warned, before runs start
 * failing (host-management spec §10): "office-server is nearly out of disk; runs may fail. Your fleet admins have
 * been told." A sentence, never a figure.
 *
 * Worked out from the whole state on every pass of the site notifications, so a person has one notice for each site
 * and condition while it lasts — however many health reports say so — and it is put away when the condition ends.
 * One that comes back is a new condition and is told again; a person who dismissed one is not told again while it
 * lasts.
 */
import { prisma } from 'wasp/server'
import { nearlyOutText, type MachineShortage } from '@agenthix/core'
import { SITE_NEARLY_OUT_NOTIFICATION as TYPE } from '../../notifications/notificationKinds'
import { clearPersistentNotification, raisePersistentNotification, type PersistentNotice } from '../../notifications/persistent'
import { affectedMembers } from '../scheduled/scheduledChanges'

export type NearlyOut = { siteId: string; siteName: string; shortage: MachineShortage }

export function nearlyOutNotice(c: NearlyOut): PersistentNotice {
  return {
    type: TYPE,
    subjectKey: `${c.siteId}:${c.shortage}`,
    title: `${c.siteName} is nearly out of ${c.shortage}`,
    body: nearlyOutText(c.siteName, c.shortage),
    dismissible: true,
  }
}

/** Makes the open warnings exactly these conditions, each for the members whose projects run on its site. */
export async function syncNearlyOutNotices(conditions: NearlyOut[]): Promise<void> {
  const notices = conditions.map(nearlyOutNotice)
  const wanted = new Set(notices.map(n => n.subjectKey))
  const open = await prisma.notification.findMany({
    where: { type: TYPE, status: { in: ['unread', 'read'] }, subjectKey: { not: null } },
    select: { subjectKey: true },
    distinct: ['subjectKey'],
  })
  for (const { subjectKey } of open) if (subjectKey && !wanted.has(subjectKey)) await clearPersistentNotification(TYPE, subjectKey)

  const membersBySite = new Map<string, string[]>()
  for (const [i, c] of conditions.entries()) {
    if (!membersBySite.has(c.siteId)) membersBySite.set(c.siteId, [...(await affectedMembers(c.siteId)).keys()])
    const members = membersBySite.get(c.siteId)!
    // Someone who no longer works there is not warned about it any more.
    await clearPersistentNotification(TYPE, notices[i].subjectKey, { exceptUserIds: members })
    await raisePersistentNotification(members, notices[i])
  }
}
