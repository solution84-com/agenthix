/**
 * The persistent notifications about the workplace that go to organisation
 * admins (every screen reviewed spec §3, Needs attention): agents whose
 * approval is Bypassed, invitations unanswered for a week, and a team the
 * built-in agent proposed. Each pass works out the whole state from the
 * database and makes the open notifications match it
 * (`syncPersistentNotifications`), so one clears itself once handled, wherever
 * it was handled. A pass runs whenever an admin's notifications or Needs
 * attention are read.
 *
 * Bypassed is a fact, not a warning: Bypassed is expected for automation. An
 * admin may acknowledge it, which records the agents acknowledged; it returns
 * when another agent is set to Bypassed. Its subject names the agents not yet
 * acknowledged, so a new one is a new notice even for an admin who dismissed
 * the last.
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import { ORG_NOTIFICATION_TYPES as T } from './notificationKinds'
import { clearPersistentNotification, syncPersistentNotifications, type PersistentNotice } from './persistent'
import { PROPOSAL_WAITING } from '../library/systemTemplates'
import { Logger } from '../server/utils/logger'

const logger = new Logger('AdminNotices')

export const BYPASSED_REVIEW_URL = '/admin/agents?approval=bypassed'
export const INVITATIONS_URL = '/admin/people?show=invitations'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function orgAdmins(): Promise<string[]> {
  const rows = await prisma.userSettings.findMany({
    where: { role: 'ADMIN', user: { deactivatedAt: null, erasedAt: null } },
    select: { userId: true },
  })
  return rows.map(r => r.userId)
}

const digest = (ids: string[]) => createHash('sha256').update([...ids].sort().join(',')).digest('hex').slice(0, 16)

/** "Release bot", "Release bot and Data analyst", "Release bot, Data analyst and 2 more". */
export function nameList(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export async function bypassedAgents(): Promise<Array<{ id: string; name: string }>> {
  return prisma.agent.findMany({ where: { approval: 'bypassed' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}

export async function syncBypassedNotice(admins?: string[]): Promise<void> {
  const [agents, org] = await Promise.all([bypassedAgents(), prisma.org.findFirst({ select: { acknowledgedBypassedAgentIds: true } })])
  const acknowledged = new Set(org?.acknowledgedBypassedAgentIds ?? [])
  // One no longer Bypassed is forgotten, so being set to Bypassed again brings the notice back.
  const stillBypassed = [...acknowledged].filter(id => agents.some(a => a.id === id))
  if (stillBypassed.length !== acknowledged.size) {
    await prisma.org.updateMany({ data: { acknowledgedBypassedAgentIds: stillBypassed } })
  }
  const unacknowledged = agents.filter(a => !acknowledged.has(a.id))
  const notices: PersistentNotice[] = unacknowledged.length === 0 ? [] : [{
    type: T.bypassed,
    subjectKey: `bypassed:${digest(unacknowledged.map(a => a.id))}`,
    title: `${plural(agents.length, 'agent')} run${agents.length === 1 ? 's' : ''} with approval Bypassed`,
    body: `${nameList(agents.map(a => a.name))} act${agents.length === 1 ? 's' : ''} without asking — their own permissions are off; the person each run is for still bounds it`,
    actionLabel: 'Review',
    actionUrl: BYPASSED_REVIEW_URL,
    dismissible: true,
  }]
  await syncPersistentNotifications(T.bypassed, notices, admins ?? (await orgAdmins()))
}

/** Records every agent now Bypassed as acknowledged, and clears the notice for every admin. */
export async function acknowledgeBypassedAgents(): Promise<{ acknowledged: string[] }> {
  const ids = (await bypassedAgents()).map(a => a.id)
  await prisma.org.updateMany({ data: { acknowledgedBypassedAgentIds: ids } })
  await clearPersistentNotification(T.bypassed, { startsWith: 'bypassed:' })
  return { acknowledged: ids }
}

export async function unansweredInvitations(now = new Date()) {
  return prisma.invite.findMany({
    where: {
      consumedAt: null,
      revokedAt: null,
      createdAt: { lte: new Date(now.getTime() - WEEK_MS) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, note: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function syncInvitationsNotice(admins?: string[]): Promise<void> {
  const invites = await unansweredInvitations()
  const notes = invites.map(i => i.note?.trim()).filter((n): n is string => !!n)
  const notices: PersistentNotice[] = invites.length === 0 ? [] : [{
    type: T.invitations,
    subjectKey: `invitations:${digest(invites.map(i => i.id))}`,
    title: `${plural(invites.length, 'invitation')} unanswered`,
    body: notes.length > 0 ? `Sent a week or more ago, for ${nameList(notes)}` : 'Sent a week or more ago',
    actionLabel: 'Review',
    actionUrl: INVITATIONS_URL,
    dismissible: false,
  }]
  await syncPersistentNotifications(T.invitations, notices, admins ?? (await orgAdmins()))
}

/** In place of the Organisation page's banner: one notice per proposal waiting for review. */
export async function syncTeamProposalNotices(admins?: string[]): Promise<void> {
  const proposals = await prisma.task.findMany({
    where: PROPOSAL_WAITING,
    select: { id: true, title: true, applicationData: true },
    orderBy: { createdAt: 'asc' },
  })
  const notices = proposals.map((p): PersistentNotice => {
    const templateId = (p.applicationData as { templateId?: unknown } | null)?.templateId
    const query = `taskId=${p.id}${typeof templateId === 'string' ? `&templateId=${encodeURIComponent(templateId)}` : ''}`
    return {
      type: T.teamProposed,
      subjectKey: `proposal:${p.id}`,
      title: `The built-in agent proposed a team: ${p.title.replace(/^Proposed: /, '')}`,
      body: 'Review who it adds before anything is created',
      actionLabel: 'Review',
      actionUrl: `/workforce-templates/review?${query}`,
      dismissible: true,
    }
  })
  await syncPersistentNotifications(T.teamProposed, notices, admins ?? (await orgAdmins()))
}

/** Every pass, best effort: a failure is logged and never fails the read that asked. */
export async function syncAdminNotices(): Promise<void> {
  try {
    const admins = await orgAdmins()
    await syncBypassedNotice(admins)
    await syncInvitationsNotice(admins)
    await syncTeamProposalNotices(admins)
  } catch (err) {
    logger.error('could not bring the admin notices up to date', err)
  }
}
