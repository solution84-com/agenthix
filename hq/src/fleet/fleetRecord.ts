/**
 * What the Fleet Console reads of hq for a fleet admin's screens (host-management spec §7, §10; core's fleetRecord.ts):
 * the record of what fleet admins did, the notices hq keeps for them about the fleet, and an account found by its
 * username so that it can be given the role. Each is answered only when the person the Fleet Console names holds the
 * role, and gives nothing else of theirs: their other notifications stay in hq.
 */
import { prisma } from 'wasp/server'
import { FLEET_ACTIVITY_PAGE, FLEET_NOTICES_MAX, type FleetActivityPage, type FleetNotice, type HqAccount } from '@agenthix/core'
import { OPEN_STATUSES } from '../notifications/notificationKinds'
import { peopleByIds, personById } from '../server/identity/people'
import { ACTIVITY_KEPT_MS } from './activity'
import { isFleetAdmin } from './fleetAdminRole'
import { FLEET_NOTICE_TYPES, fleetNoticeOf } from './fleetNoticeKinds'
import { ConsoleRefusal } from './consoleMethods'

async function mustHoldRole(userId: string): Promise<void> {
  if (!(await isFleetAdmin(userId))) throw new ConsoleRefusal('not_allowed', 'Only a fleet admin sees this.')
}

export async function activityPage(byUserId: string, after?: string, now = new Date()): Promise<FleetActivityPage> {
  await mustHoldRole(byUserId)
  const rows = await prisma.fleetActivity.findMany({
    where: { at: { gte: new Date(now.getTime() - ACTIVITY_KEPT_MS) } },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    take: FLEET_ACTIVITY_PAGE + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  })
  const page = rows.slice(0, FLEET_ACTIVITY_PAGE)
  const people = await peopleByIds(page.flatMap(r => (r.byUserId ? [r.byUserId] : [])))
  return {
    entries: page.map(r => ({
      id: r.id,
      at: r.at.toISOString(),
      by: r.byUserId ? { id: r.byUserId, name: people.get(r.byUserId)?.name ?? 'Someone no longer in HQ' } : null,
      action: r.action,
      subject: r.subject,
    })),
    next: rows.length > FLEET_ACTIVITY_PAGE ? page[page.length - 1].id : null,
  }
}

const fleetNoticesOf = (userId: string) => ({ userId, type: { in: [...FLEET_NOTICE_TYPES] }, status: { in: [...OPEN_STATUSES] } })

export async function fleetNotices(byUserId: string): Promise<{ notices: FleetNotice[] }> {
  await mustHoldRole(byUserId)
  const rows = await prisma.notification.findMany({
    where: fleetNoticesOf(byUserId),
    orderBy: { createdAt: 'desc' },
    take: FLEET_NOTICES_MAX,
    select: { id: true, type: true, title: true, body: true, createdAt: true, dismissible: true, subjectKey: true },
  })
  return { notices: rows.map(fleetNoticeOf).filter((n): n is FleetNotice => n !== null) }
}

/** `dismissed` is false for a notice that is not open: already put away, cleared, or not theirs. */
export async function dismissFleetNotice(byUserId: string, noticeId: string): Promise<{ dismissed: boolean }> {
  await mustHoldRole(byUserId)
  const row = await prisma.notification.findFirst({ where: { id: noticeId, ...fleetNoticesOf(byUserId) }, select: { dismissible: true } })
  if (!row) return { dismissed: false }
  if (!row.dismissible) throw new ConsoleRefusal('not_allowed', 'This notice clears itself once the machine is back, or removed.')
  const { count } = await prisma.notification.updateMany({ where: { id: noticeId, userId: byUserId }, data: { status: 'dismissed' } })
  return { dismissed: count > 0 }
}

export async function findAccount(byUserId: string, username: string): Promise<{ account: HqAccount | null }> {
  await mustHoldRole(byUserId)
  const identity = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } },
    select: { auth: { select: { user: { select: { id: true, fleetAdmin: true, deactivatedAt: true, erasedAt: true, settings: { select: { role: true } } } } } } },
  })
  const user = identity?.auth.user
  if (!user || user.deactivatedAt || user.erasedAt) return { account: null }
  return {
    account: {
      id: user.id,
      name: (await personById(user.id)).name,
      username,
      organisationAdmin: user.settings?.role === 'ADMIN',
      fleetAdmin: user.fleetAdmin,
    },
  }
}
