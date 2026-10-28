/**
 * Needs attention (every screen reviewed spec §3, Organisation): one list, for
 * an organisation admin, of what needs them across the workplace and the
 * infrastructure, each item with its one action. The items are the admin's own
 * open notifications — a site in trouble, model access failing, a machine
 * asking to connect, approvals waiting, invitations unanswered for a week, a
 * proposed team, the agents with approval Bypassed — so handling one in either
 * place clears both. Their own waiting tasks are not here: those are Home's.
 */
import type { Notification } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { entitledProjectsFilter } from '../projects/membership'
import { ORG_NOTIFICATION_TYPES, OPEN_STATUSES, RUN_SHORT_NOTIFICATION, SITE_NOTIFICATION_TYPES, taskKeyOf } from './notificationKinds'
import { syncAdminNotices } from './adminNotices'
import { staleRequestIds } from './staleRequests'
import { skillProposalsItem, SKILL_PROPOSALS_ITEM_TYPE } from '../assets/pages/review/attention'

type Ctx = { user?: { id: string } | null }

export type AttentionItem = {
  /** Stable for the item: its notification's id, or `approvals` for the approvals gathered as one. */
  key: string
  area: 'infrastructure' | 'workplace'
  type: string
  title: string
  body: string
  actionLabel: string | null
  actionUrl: string | null
  /** The notifications it stands for; handling it handles them. */
  notificationIds: string[]
  /** Dismiss, or for Bypassed Acknowledge (`acknowledgeBypassedAgents`). */
  dismissible: boolean
  acknowledgeable: boolean
  createdAt: Date
}

const INFRASTRUCTURE = new Set<string>([...Object.values(SITE_NOTIFICATION_TYPES), RUN_SHORT_NOTIFICATION, 'credential_health'])

/** The order an admin acts in: what is broken, then who is waiting to get in, then the rest. */
const ORDER: string[] = [
  SITE_NOTIFICATION_TYPES.hqSiteDown, SITE_NOTIFICATION_TYPES.health, RUN_SHORT_NOTIFICATION, SITE_NOTIFICATION_TYPES.offlineWithWork,
  SITE_NOTIFICATION_TYPES.upgrade, 'credential_health', SITE_NOTIFICATION_TYPES.requests, SITE_NOTIFICATION_TYPES.requestExpired,
  'tool_approval', ORG_NOTIFICATION_TYPES.invitations, ORG_NOTIFICATION_TYPES.teamProposed, SKILL_PROPOSALS_ITEM_TYPE,
  ORG_NOTIFICATION_TYPES.bypassed,
]

const ATTENTION_TYPES = ORDER

function itemOf(n: Notification): AttentionItem {
  return {
    key: n.id,
    area: INFRASTRUCTURE.has(n.type) ? 'infrastructure' : 'workplace',
    type: n.type,
    title: n.title,
    body: n.body,
    actionLabel: n.actionLabel,
    actionUrl: n.actionUrl,
    notificationIds: [n.id],
    dismissible: n.dismissible && n.type !== ORG_NOTIFICATION_TYPES.bypassed,
    acknowledgeable: n.type === ORG_NOTIFICATION_TYPES.bypassed,
    createdAt: n.createdAt,
  }
}

/** The approvals waiting on this admin, as one item naming the projects they are in. */
async function approvalsItem(approvals: Notification[], me: string): Promise<AttentionItem | null> {
  if (approvals.length === 0) return null
  const keys = [...new Set(approvals.map(n => taskKeyOf(n.actionUrl)?.split('-')[0]).filter((k): k is string => !!k))]
  const projects = await prisma.project.findMany({
    where: { key: { in: keys }, ...entitledProjectsFilter(me) },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  const oldest = approvals.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b))
  const n = approvals.length
  const names = projects.map(p => p.name)
  return {
    key: 'approvals',
    area: 'workplace',
    type: 'tool_approval',
    title: `${n} approval${n === 1 ? '' : 's'} waiting`,
    body: names.length === 0 ? '' : `In ${names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`}`,
    actionLabel: 'Open in Runs',
    actionUrl: '/runs',
    notificationIds: approvals.map(a => a.id),
    dismissible: false,
    acknowledgeable: false,
    createdAt: oldest.createdAt,
  }
}

export const getNeedsAttention = async (_args: unknown, context: Ctx): Promise<AttentionItem[]> => {
  await requireRole(context, 'ADMIN', 'Reading what needs an admin')
  if (!context.user) throw new HttpError(401)
  const me = context.user.id
  await syncAdminNotices()
  const open = await prisma.notification.findMany({
    where: { userId: me, type: { in: ATTENTION_TYPES }, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: 'desc' },
  })
  // An approval answered before its notification cleared is handled here, as the panel does.
  const requests = open.filter(n => n.type === 'tool_approval')
  const answered = new Set(await staleRequestIds(requests))
  if (answered.size > 0) {
    await prisma.notification.updateMany({ where: { id: { in: [...answered] }, userId: me }, data: { status: 'handled' } })
  }
  const approvals = await approvalsItem(requests.filter(n => !answered.has(n.id)), me)
  // Read from the proposals themselves, so handling the last one clears it.
  const skills = await skillProposalsItem(prisma, me)
  const items = [...open.filter(n => n.type !== 'tool_approval').map(itemOf), ...(approvals ? [approvals] : []), ...(skills ? [skills] : [])]
  return items.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
}
