/**
 * A project's people. Listing them needs membership of the project — a private
 * project's member list is part of what being private hides, so a non-member
 * is told the project is not found, as for a missing one. An open project's
 * people are in its preview (projectPreview.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import { requireMayManageProjectPeople, type ProjectRole } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { refuseOnPersonalProject } from './personalProject'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'
import { hideOtherVisitors } from '../demo/visitors'
import type { PersonSummary } from '../server/identity/personSummary'
import type { OrgRole } from '../server/identity/rolePolicy'

type Ctx = { user?: { id: string } | null }

export type ProjectMemberRow = {
  userId: string
  role: ProjectRole
  /** The person's name as shown; kept for screens that read it before `person`. */
  username: string
  person: PersonSummary
  joinedAt: Date
}

export const getProjectMembers = async ({ projectId }: { projectId: string }, context: Ctx): Promise<ProjectMemberRow[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectVisible(projectId, context.user.id)

  const rows = await prisma.projectMember.findMany({
    where: { projectId, user: hideOtherVisitors(context.user.id) },
    select: { userId: true, role: true, createdAt: true },
    // Admins first, then by when they joined.
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  const people = await peopleByIds(rows.map(r => r.userId))
  return rows.map(r => {
    const person = people.get(r.userId)!
    return { userId: r.userId, role: r.role, username: person.name, person, joinedAt: r.createdAt }
  })
}

export type PersonToAdd = {
  userId: string
  /** The person's name as shown; kept for screens that read it before `person`. */
  username: string
  person: PersonSummary
  orgRole: OrgRole | null
  /** How many projects they are in, their own space not counted. */
  projectCount: number
  /** Already in this project (shown with a ✓ rather than Add). */
  isMember: boolean
}

/**
 * Everyone in the org who has not left, for Add (spec §3, People): full name,
 * handle, organisation role and how many projects they are in, so two people
 * with the same first name are told apart. Open to whoever may change the
 * project's people.
 */
export const listPeopleForProject = async ({ projectId }: { projectId: string }, context: Ctx): Promise<PersonToAdd[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayManageProjectPeople(projectId, context.user.id, 'Listing people to add')
  await refuseOnPersonalProject(projectId, 'Adding a person')

  const users = await prisma.user.findMany({
    where: { ...ACTIVE_PERSON, ...hideOtherVisitors(context.user.id) },
    select: {
      id: true,
      settings: { select: { role: true } },
      projectMemberships: { where: { project: { personalOwnerId: null } }, select: { projectId: true } },
    },
  })
  const people = await peopleByIds(users.map(u => u.id))
  return users
    .map((u): PersonToAdd => {
      const person = people.get(u.id)!
      return {
        userId: u.id,
        username: person.name,
        person,
        orgRole: u.settings?.role ?? null,
        projectCount: u.projectMemberships.length,
        isMember: u.projectMemberships.some(m => m.projectId === projectId),
      }
    })
    .sort((a, b) => a.person.name.localeCompare(b.person.name))
}
