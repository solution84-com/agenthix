/**
 * A person's profile card (every screen reviewed spec §3, People), opened from
 * their name or picture anywhere: picture, name, handle, organisation role,
 * their local time beside yours, the projects you share, and — opened inside
 * a project you are in — their role and tasks there. Anyone in the
 * organisation may open it; it shows only what the viewer already shares with
 * them, so a private project they are in is never named to someone outside it.
 */
import type { GetPersonCard } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { personById } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'
import { isOrgAdmin, isProjectMember, type ProjectRole } from '../projects/membership'
import { countByState, type TaskStateCounts } from '../agents/agentNow'
import type { OrgRole } from '../server/identity/rolePolicy'

type Ctx = { user?: { id: string } | null }

export type PersonCard = {
  person: PersonSummary
  /** Null once erased. */
  orgRole: OrgRole | null
  timezone: string | null
  viewerTimezone: string | null
  sharedProjects: { id: string; key: string; name: string }[]
  /** Their role and tasks in the project the card was opened in, when both of you are in it. */
  here: { projectId: string; role: ProjectRole; tasks: TaskStateCounts } | null
  isMe: boolean
  /** The viewer is an organisation admin, so Manage shows. */
  viewerIsOrgAdmin: boolean
}

async function hereFor(projectId: string, userId: string, viewerId: string): Promise<PersonCard['here']> {
  if (!(await isProjectMember(projectId, viewerId))) return null
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!member) return null
  const tasks = await prisma.task.findMany({
    where: { projectId, archived: false, onBehalfOfUserId: userId },
    select: { state: true, runState: true, runStateReason: true, assignedAgentId: true },
  })
  return { projectId, role: member.role, tasks: countByState(tasks) }
}

export const getPersonCard: GetPersonCard<{ userId: string; projectId?: string }, PersonCard> = async (args, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const viewerId = context.user.id
  const exists = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true } })
  if (!exists) throw new HttpError(404, 'Person not found')
  const [person, settings, viewerSettings, shared, viewerIsOrgAdmin] = await Promise.all([
    personById(args.userId),
    prisma.userSettings.findUnique({ where: { userId: args.userId }, select: { role: true, timezone: true } }),
    prisma.userSettings.findUnique({ where: { userId: viewerId }, select: { timezone: true } }),
    prisma.project.findMany({
      where: {
        personalOwnerId: null,
        AND: [{ members: { some: { userId: args.userId } } }, { members: { some: { userId: viewerId } } }],
      },
      select: { id: true, key: true, name: true },
      orderBy: { name: 'asc' },
    }),
    isOrgAdmin(viewerId),
  ])
  return {
    person,
    orgRole: settings?.role ?? null,
    timezone: settings?.timezone ?? null,
    viewerTimezone: viewerSettings?.timezone ?? null,
    sharedProjects: args.userId === viewerId ? [] : shared,
    here: args.projectId ? await hereFor(args.projectId, args.userId, viewerId) : null,
    isMe: args.userId === viewerId,
    viewerIsOrgAdmin,
  }
}
