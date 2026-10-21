/**
 * A project's People tool (every screen reviewed spec §3, People): who takes
 * part here and what waits on them. Both reads need membership of the
 * project; one the person is not in answers as not found, like the project
 * itself. hq's own records only — nothing here asks a site.
 */
import type { GetProjectPeople, GetProjectPerson } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { isOrgAdmin, mayManageProjectPeople, type ProjectRole } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { readPeopleWork, type PersonWork } from './personWork'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'
import type { OrgRole } from '../server/identity/rolePolicy'

type Ctx = { user?: { id: string } | null }

export type ProjectPersonRow = {
  person: PersonSummary
  role: ProjectRole
  joinedAt: Date
} & PersonWork

export type ProjectPeopleView = {
  project: { id: string; key: string; name: string; accessLevel: 'OPEN' | 'PRIVATE'; personal: boolean }
  /** The person may add, promote, demote and remove people here. */
  canManage: boolean
  people: ProjectPersonRow[]
}

export type ProjectPersonView = ProjectPersonRow & {
  project: ProjectPeopleView['project']
  canManage: boolean
  isMe: boolean
  /** Their IANA timezone, for their local time; null when they never set one. */
  timezone: string | null
  orgRole: OrgRole | null
  /** When they joined the organisation. */
  orgJoinedAt: Date | null
  /** The viewer is an organisation admin, so "Manage in Organisation" shows. */
  viewerIsOrgAdmin: boolean
}

async function projectHere(projectId: string, userId: string) {
  await requireProjectVisible(projectId, userId)
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, key: true, name: true, accessLevel: true, personalOwnerId: true },
  })
  return {
    view: { id: project.id, key: project.key, name: project.name, accessLevel: project.accessLevel, personal: project.personalOwnerId !== null },
    canManage: await mayManageProjectPeople(projectId, userId),
  }
}

async function rowsFor(projectId: string, userIds?: string[]): Promise<ProjectPersonRow[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, user: ACTIVE_PERSON, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { userId: true, role: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  const ids = members.map(m => m.userId)
  const [people, work] = await Promise.all([peopleByIds(ids), readPeopleWork(projectId, ids)])
  return members.map(m => ({ person: people.get(m.userId)!, role: m.role, joinedAt: m.createdAt, ...work.get(m.userId)! }))
}

export const getProjectPeople: GetProjectPeople<{ projectId: string }, ProjectPeopleView> = async ({ projectId }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const here = await projectHere(projectId, context.user.id)
  return { project: here.view, canManage: here.canManage, people: await rowsFor(projectId) }
}

export const getProjectPerson: GetProjectPerson<{ projectId: string; userId: string }, ProjectPersonView> = async (args, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const here = await projectHere(args.projectId, context.user.id)
  const [row] = await rowsFor(args.projectId, [args.userId])
  if (!row) throw new HttpError(404, 'That person is not a member of this project')
  const [settings, viewerIsOrgAdmin] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: args.userId }, select: { role: true, timezone: true, createdAt: true } }),
    isOrgAdmin(context.user.id),
  ])
  return {
    ...row,
    project: here.view,
    canManage: here.canManage,
    isMe: args.userId === context.user.id,
    timezone: settings?.timezone ?? null,
    orgRole: settings?.role ?? null,
    orgJoinedAt: settings?.createdAt ?? null,
    viewerIsOrgAdmin,
  }
}
