/**
 * Project entitlement (spec §6.4, ADR-0062, adr-0099, adr-0102). Membership is
 * the gate: reading a project's work needs a member row, whether the project is
 * open or private, and working in it — changing anything, starting or stopping
 * a run, commenting, approving — needs that row's role to be Member or Admin. A
 * project Viewer reads and changes nothing. No organisation role grants or
 * withholds work in a project. Whether a project is open decides only who may
 * see what it is (its preview) and who may join it.
 *
 * A person who has left the organisation (adr-0100) has no member rows, and is
 * refused their own personal project too: they can neither act nor be chosen.
 *
 * An org admin is deliberately absent from `requireProjectMember` and
 * `requireProjectAdmin`. They manage a project's people in any project they
 * can see — an open one, or a private one they are in — visibly, in the member
 * list, and nothing more. A private project they are not in stays out of reach.
 */
import { HttpError, prisma } from 'wasp/server'

export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

/** What the person may do in the project: work in it, only read it, or nothing. */
export type ProjectStanding = 'works' | 'reads' | 'none'

export async function projectStanding(projectId: string, userId: string): Promise<ProjectStanding> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { personalOwnerId: true, personalOwner: { select: { deactivatedAt: true } } },
  })
  if (!project) return 'none'
  // A personal project is its owner's alone, whatever its member rows say
  // (agents own schedule spec §4) — checked first, so no other row can open it.
  if (project.personalOwnerId) {
    return project.personalOwnerId === userId && project.personalOwner?.deactivatedAt === null ? 'works' : 'none'
  }
  const role = await projectRole(projectId, userId)
  if (role === null) return 'none'
  return role === 'VIEWER' ? 'reads' : 'works'
}

/** Whether the person may read the project's work: any member, Viewers included. */
export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  return (await projectStanding(projectId, userId)) !== 'none'
}

/** Whether the person may work in the project (adr-0102): a Member or Admin of it, or its owner if it is their own. */
export async function mayWorkInProject(projectId: string, userId: string): Promise<boolean> {
  return (await projectStanding(projectId, userId)) === 'works'
}

export const VIEWER_REFUSAL = 'A Viewer reads this project and changes nothing; ask one of its admins.'

/** The browser's refusal for anything that changes a project: a non-member, then a Viewer, each told why. */
export async function requireMayWorkInProject(projectId: string, userId: string, what: string): Promise<void> {
  const standing = await projectStanding(projectId, userId)
  if (standing === 'none') throw new HttpError(403, `${what} requires membership of this project`)
  if (standing === 'reads') throw new HttpError(403, `${what} needs the Member or Admin role in this project. ${VIEWER_REFUSAL}`)
}

/**
 * A Prisma `where` that keeps only the projects this person is a member of:
 * the ones they are listed on, and their own personal project and nobody
 * else's. The same rule as `isProjectMember`, in one query. A personal project
 * is excluded from the first branch rather than trusted to have one member.
 */
export function entitledProjectsFilter(userId: string) {
  return {
    OR: [
      { personalOwnerId: null, members: { some: { userId } } },
      { personalOwnerId: userId },
    ],
  }
}

/**
 * The projects a person may see listed: the ones they are a member of, and
 * every open project in the organisation, which they may preview and join
 * (adr-0099). Never a work read: those use `entitledProjectsFilter`.
 */
export function visibleProjectsFilter(userId: string) {
  return {
    OR: [
      ...entitledProjectsFilter(userId).OR,
      { accessLevel: 'OPEN' as const, personalOwnerId: null },
    ],
  }
}

/** Whether the person may see that the project exists: a member, or anyone for an open one. */
export async function isProjectVisibleTo(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { accessLevel: true, personalOwnerId: true },
  })
  if (!project) return false
  if (!project.personalOwnerId && project.accessLevel === 'OPEN') return true
  return isProjectMember(projectId, userId)
}

export async function requireProjectMember(projectId: string, userId: string, what: string): Promise<void> {
  if (!(await isProjectMember(projectId, userId))) {
    throw new HttpError(403, `${what} requires membership of this project`)
  }
}

export async function projectRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return row?.role ?? null
}

export async function requireProjectAdmin(projectId: string, userId: string, what: string): Promise<void> {
  if ((await projectRole(projectId, userId)) !== 'ADMIN') {
    throw new HttpError(403, `${what} requires being an admin of this project`)
  }
}

export async function isOrgAdmin(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { role: true } })
  return settings?.role === 'ADMIN'
}

/**
 * Whether the person may change this project's people — add, promote, demote,
 * remove: its admins, and the organisation's admins in a project they can see
 * (adr-0062, annotated 2026-10-08). A private project an org admin is not in is
 * not reached; a person's own project is nobody's to change.
 */
export async function mayManageProjectPeople(projectId: string, userId: string): Promise<boolean> {
  if ((await projectRole(projectId, userId)) === 'ADMIN') return true
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { accessLevel: true, personalOwnerId: true },
  })
  if (!project || project.personalOwnerId) return false
  if (!(await isOrgAdmin(userId))) return false
  return project.accessLevel === 'OPEN' || (await projectRole(projectId, userId)) !== null
}

export async function requireMayManageProjectPeople(projectId: string, userId: string, what: string): Promise<void> {
  if (!(await mayManageProjectPeople(projectId, userId))) {
    throw new HttpError(403, `${what} requires being an admin of this project or of the organisation`)
  }
}

/**
 * Who may assign an agent to a project: its admins, and the organisation's
 * admins for any project but a person's own (every screen reviewed spec §3,
 * Organisation › Agents). Assigning reads nothing in the project; it is visible
 * in the project's Agents tool.
 */
export async function requireMayAssignAgents(projectId: string, userId: string): Promise<void> {
  if ((await projectRole(projectId, userId)) === 'ADMIN') return
  const [orgAdmin, project] = await Promise.all([
    isOrgAdmin(userId),
    prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } }),
  ])
  if (orgAdmin && project && !project.personalOwnerId) return
  throw new HttpError(403, 'Assigning an agent to this project requires being an admin of this project or of the organisation')
}

/**
 * The projects this person is the only admin of. Removing them from the org, or
 * from one of these projects, would leave it with nobody able to administer it,
 * and is refused (spec §6.4).
 */
export async function projectsLeftWithoutAnAdmin(
  userId: string,
): Promise<{ id: string; name: string; key: string }[]> {
  // A personal project is never orphaned: nobody else is ever its member.
  const administered = await prisma.projectMember.findMany({
    where: { userId, role: 'ADMIN', project: { personalOwnerId: null } },
    select: { project: { select: { id: true, name: true, key: true } } },
  })
  const orphaned: { id: string; name: string; key: string }[] = []
  for (const { project } of administered) {
    const admins = await prisma.projectMember.count({
      where: { projectId: project.id, role: 'ADMIN' },
    })
    if (admins <= 1) orphaned.push(project)
  }
  return orphaned
}
