/**
 * The people who look after machines are told when a run stops for lack of resources, with what to do (host-management
 * spec §10) — which is what lets the run say "Your fleet admins have been told."
 *
 * One notice for each site and cause a day: a site short of memory fails runs one after another, and a notice for
 * each would bury the rest. A run that fails again the same day brings nothing new; the day before's notice is put
 * away when a new day's is raised, and a person may dismiss one.
 *
 * The frame is a site's claim, so it counts only from the site that owns the run's session.
 */
import { prisma } from 'wasp/server'
import { BRANDING, memoryAmountText, parseRunResourceShortage, type RunResourceShortage, type RunStatusEvent } from '@agenthix/core'
import { raisePersistentNotification, type PersistentNotice } from '../../notifications/persistent'
import { RUN_SHORT_NOTIFICATION } from '../../notifications/notificationKinds'
import { sessionOwnedBy } from '../channel/sessionOwnerSite'
import { fleetAdminRecipients } from '../fleetAdmins'
import { SITES_PAGE_URL } from '../siteNotifications'
import { siteNameOf } from './runResourceWords'

const capacity = (setting: string) => `${BRANDING.cliCommand} capacity set ${setting}`

/** What the people who look after the machine read: what happened, and what to do about it. */
export function runShortWords(shortage: RunResourceShortage, siteName: string): { title: string; body: string } {
  switch (shortage.cause) {
    case 'memory': {
      const gets = shortage.limit ? `Each run there gets ${memoryAmountText(shortage.limit)}. ` : ''
      return {
        title: `A run on ${siteName} ran out of memory`,
        body: `${gets}Give each run more memory, or run fewer at once, with "${capacity('--memory <size>')}" or "${capacity('--containers <n>')}" on that machine.`,
      }
    }
    case 'processes': {
      const may = shortage.limit ? `Each run there may start ${shortage.limit} processes. ` : ''
      return {
        title: `A run on ${siteName} reached its process limit`,
        body: `${may}Raise it with "${capacity('--processes <n>')}" on that machine.`,
      }
    }
    case 'disk':
      return {
        title: `A run on ${siteName} stopped: its disk is full`,
        body: "Free space on that machine's disk, or give it a larger one. Runs there fail until there is room.",
      }
  }
}

const dayOf = (at: Date) => at.toISOString().slice(0, 10)

export function runShortNotice(siteId: string, siteName: string, shortage: RunResourceShortage, at: Date): PersistentNotice {
  return {
    type: RUN_SHORT_NOTIFICATION,
    subjectKey: `${siteId}:${shortage.cause}:${dayOf(at)}`,
    ...runShortWords(shortage, siteName),
    actionLabel: 'Open Execution Sites',
    actionUrl: SITES_PAGE_URL,
    dismissible: true,
  }
}

export async function tellOfShortRun(e: RunStatusEvent, siteId: string, now = new Date()): Promise<void> {
  if (e.status !== 'FAILED') return
  const shortage = parseRunResourceShortage(e.resource)
  if (!shortage) return
  if (!(await sessionOwnedBy(e.sessionId, siteId))) return
  const notice = runShortNotice(siteId, await siteNameOf(siteId), shortage, now)
  // An earlier day's notice about the same site and cause is old news once today's is raised.
  await prisma.notification.updateMany({
    where: {
      type: RUN_SHORT_NOTIFICATION, status: { in: ['unread', 'read'] },
      subjectKey: { startsWith: `${siteId}:${shortage.cause}:`, not: notice.subjectKey },
    },
    data: { status: 'handled' },
  })
  await raisePersistentNotification(await fleetAdminRecipients(), notice)
}

/** Imported when called: the channel's event handler reaches the site notifications, which start this. */
export async function registerRunResourceNotices(): Promise<void> {
  const { onRunStatus } = await import('../channel/siteEventHandler')
  onRunStatus('run-resource-notice', (e, siteId) => tellOfShortRun(e, siteId))
}
