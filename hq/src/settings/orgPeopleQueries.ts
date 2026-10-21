/**
 * Organisation › People (every screen reviewed spec §3, People), for
 * organisation admins: everyone with their state — here, left or erased — and
 * the invitations, waiting and earlier; and one person, with the projects
 * they are in. A private project the admin is not in is counted, never named
 * (adr-0062, annotated 2026-10-08).
 */
import type { GetOrgPeople, GetOrgPerson } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { peopleByIds } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'
import { openTaskCountsOf } from '../projects/openTaskHandover'
import { invitationViews, type InvitationView } from '../auth/invitationViews'
import type { OrgRole } from '../server/identity/rolePolicy'
import type { ProjectRole } from '../projects/membership'

type Ctx = { user?: { id: string } | null }

export type OrgPersonRow = {
  person: PersonSummary
  /** Null once erased. */
  orgRole: OrgRole | null
  /** Projects they are in, their own space not counted. */
  projectCount: number
  joinedAt: Date | null
  leftAt: Date | null
  isMe: boolean
  /** The fleet admin role, held on the account and given only in the Fleet Console (spec §7); shown, never changed, here. */
  fleetAdmin: boolean
  fleetAdminSince: Date | null
}

export type OrgPeopleView = {
  people: OrgPersonRow[]
  invitations: { waiting: InvitationView[]; earlier: InvitationView[] }
}

export type OrgPersonProject = {
  id: string
  key: string
  name: string
  accessLevel: 'OPEN' | 'PRIVATE'
  role: ProjectRole
  /** Open tasks done on their behalf there: what Remove asks about. */
  openTaskCount: number
}

export type OrgPersonView = OrgPersonRow & {
  timezone: string | null
  projects: OrgPersonProject[]
  /** Private projects they are in that the viewing admin is not: counted, never named. */
  privateProjectCount: number
  /** Who removed them, while they are left. */
  leftBy: PersonSummary | null
  /** Who created the invitation they accepted; null for the first admin, who came in with the setup key. */
  invitedBy: PersonSummary | null
  /** The invitation they accepted was made on hq's machine (`agenthix invite-admin`): "Invited from HQ's machine". */
  invitedFromHqMachine: boolean
}

export const getOrgPeople: GetOrgPeople<void, OrgPeopleView> = async (_args, context: Ctx) => {
  await requireRole(context, 'ADMIN', 'Listing the organisation\'s people')
  const users = await prisma.user.findMany({
    select: {
      id: true, deactivatedAt: true, fleetAdmin: true, fleetAdminSince: true,
      settings: { select: { role: true, createdAt: true } },
      _count: { select: { projectMemberships: { where: { project: { personalOwnerId: null } } } } },
    },
  })
  const people = await peopleByIds(users.map(u => u.id))
  const rows = users.map((u): OrgPersonRow => ({
    person: people.get(u.id)!,
    orgRole: u.settings?.role ?? null,
    projectCount: u._count.projectMemberships,
    joinedAt: u.settings?.createdAt ?? null,
    leftAt: u.deactivatedAt,
    isMe: u.id === context.user!.id,
    fleetAdmin: u.fleetAdmin,
    fleetAdminSince: u.fleetAdmin ? u.fleetAdminSince : null,
  }))
  const order = { active: 0, left: 1, erased: 2 } as const
  rows.sort((a, b) => order[a.person.state] - order[b.person.state] || a.person.name.localeCompare(b.person.name))
  return { people: rows, invitations: await invitationViews(context.user!.id) }
}

export const getOrgPerson: GetOrgPerson<{ userId: string }, OrgPersonView> = async ({ userId }, context: Ctx) => {
  await requireRole(context, 'ADMIN', 'Reading a person')
  const viewer = context.user!.id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, deactivatedAt: true, deactivatedById: true, fleetAdmin: true, fleetAdminSince: true,
      settings: { select: { role: true, createdAt: true, timezone: true } },
      projectMemberships: {
        where: { project: { personalOwnerId: null } },
        select: {
          role: true,
          project: {
            select: {
              id: true, key: true, name: true, accessLevel: true,
              members: { where: { userId: viewer }, select: { userId: true } },
            },
          },
        },
      },
    },
  })
  if (!user) throw new HttpError(404, 'Person not found')
  const invite = await prisma.invite.findFirst({ where: { consumedBy: userId }, select: { createdBy: true, kind: true } })
  const named = await peopleByIds([userId, user.deactivatedById, invite?.createdBy].filter((id): id is string => !!id))
  const person = named.get(userId)!
  const reachable = user.projectMemberships.filter(m => m.project.accessLevel === 'OPEN' || m.project.members.length > 0)
  const counts = await openTaskCountsOf(userId, reachable.map(m => m.project.id))
  return {
    person,
    orgRole: user.settings?.role ?? null,
    projectCount: user.projectMemberships.length,
    joinedAt: user.settings?.createdAt ?? null,
    leftAt: user.deactivatedAt,
    isMe: userId === viewer,
    fleetAdmin: user.fleetAdmin,
    fleetAdminSince: user.fleetAdmin ? user.fleetAdminSince : null,
    timezone: user.settings?.timezone ?? null,
    projects: reachable
      .map(({ role, project: p }) => ({
        id: p.id, key: p.key, name: p.name, accessLevel: p.accessLevel, role, openTaskCount: counts.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    privateProjectCount: user.projectMemberships.length - reachable.length,
    leftBy: user.deactivatedById ? named.get(user.deactivatedById) ?? null : null,
    invitedBy: invite?.createdBy ? named.get(invite.createdBy) ?? null : null,
    invitedFromHqMachine: invite?.kind === 'INVITATION' && invite.createdBy === null,
  }
}
