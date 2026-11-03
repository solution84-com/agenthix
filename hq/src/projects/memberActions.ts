/**
 * A project's members are people (ADR-0062), and the member list is everyone
 * who reads it (adr-0099); its Viewers read and change nothing (adr-0102). Its admins change its people, and so do the
 * organisation's admins in any project they can see (`mayManageProjectPeople`).
 * Anyone in the organisation may join an open project in one step, and anyone
 * may leave one, unless they are its last admin.
 *
 * Setting the access level is the project admin's alone: it decides who can see
 * the project, and an org admin opening a private one quietly is exactly what
 * spec §6.4 refuses.
 *
 * A project's teams write their people in as members too (adr-0103). Everything
 * here changes a person's membership in their own right: someone there only
 * through a team is changed through the team, and someone there both ways who
 * stops being a member in their own right stays, with the team's role.
 */
import { HttpError, prisma } from 'wasp/server'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { isOrgAdmin, requireMayManageProjectPeople, requireProjectAdmin, type ProjectRole } from './membership'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../sites/heldInstructions'
import { sitesForMemberInProject } from '../sites/membershipEnding'
import { refuseOnPersonalProject } from './personalProject'
import { isActivePerson } from '../server/identity/people'
import { parseOpenTasksDestination, type OpenTasksDestination } from './openTasksDestination'
import { checkOpenTasksDestination, handOverOpenTasks } from './openTaskHandover'
import { writePerson } from '../org/teams/writeThrough'
import { personRow } from '../org/teams/teamRoles'
import { closeProjectConversations, declineWaitingInProject } from '../conversations/closing'
import { appTickets } from '../relays'
import { leaveRoomsNoLongerAllowed } from '../server/roomAccess'

type Ctx = { user?: { id: string } | null }

/**
 * No project may be left without a project admin (spec §6.4). The rule is
 * enforced wherever a project would lose its last one — here for removal,
 * leaving and demotion, and in settings/leaving.ts for removal from the org.
 */
async function assertNotTheLastAdmin(projectId: string, userId: string, act: string, roleAfter: ProjectRole | null = null): Promise<void> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  // Not a member at all: say so, rather than letting Prisma's P2025 surface as a
  // 500 with its own message in front of the person.
  if (!row) throw new HttpError(404, 'That person is not a member of this project')
  if (row.role !== 'ADMIN' || roleAfter === 'ADMIN') return
  const admins = await prisma.projectMember.count({ where: { projectId, role: 'ADMIN' } })
  if (admins <= 1) {
    throw new HttpError(400, `${act} would leave this project without an admin. Appoint another admin first.`)
  }
}

/** Their membership row as it stands, and the roles their teams here give them. */
async function standingOf(projectId: string, userId: string) {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true, direct: true, ownRole: true },
  })
  const teams = await prisma.projectTeam.findMany({
    where: { projectId, team: { people: { some: { userId } } } },
    select: { role: true, team: { select: { name: true } } },
  })
  return { row, teamRoles: teams.map(t => t.role), teamNames: teams.map(t => t.team.name) }
}

/** Refuses a change in their own right to someone who is a member only through teams. */
function refuseOnlyThroughTeams(row: { direct: boolean } | null, teamNames: string[], act: string): void {
  if (row && !row.direct) {
    throw new HttpError(400, `${act}: they are here through ${teamNames.join(', ') || 'a team'}, so they are changed in the team`)
  }
}

/**
 * An org admin may add themselves to a private project they are not in
 * (adr-0062: "they may add themselves, and the member list shows it"); every
 * other change of a project's people needs `mayManageProjectPeople`.
 */
async function requireMayAdd(projectId: string, actorId: string, userId: string): Promise<void> {
  if (actorId === userId && (await isOrgAdmin(actorId))) return
  await requireMayManageProjectPeople(projectId, actorId, 'Adding a person to this project')
}

export const addProjectMember = async (
  { projectId, userId, role = 'MEMBER' }: { projectId: string; userId: string; role?: ProjectRole },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayAdd(projectId, context.user.id, userId)
  // A personal project has exactly one member (spec §4).
  await refuseOnPersonalProject(projectId, 'Adding a person')
  if (!(await isActivePerson(userId))) throw new HttpError(400, 'Only someone in the organisation can be added')
  // Adding somebody who is already a member in their own right is idempotent
  // and must not change their role: writing the default MEMBER would demote an
  // existing admin past the last-admin check that setProjectMemberRole applies
  // to that very write. Changing a role is its job. Someone here only through a
  // team becomes a member in their own right too, keeping the higher role.
  await prisma.$transaction(async (tx) => {
    const row = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { direct: true } })
    if (!row?.direct) await writePerson(tx, projectId, userId, role)
  })
  return prisma.projectMember.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId } } })
}

export const setProjectMemberRole = async (
  { projectId, userId, role }: { projectId: string; userId: string; role: ProjectRole },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayManageProjectPeople(projectId, context.user.id, "Changing a member's role")
  await refuseOnPersonalProject(projectId, "Changing a member's role")
  const { row, teamRoles, teamNames } = await standingOf(projectId, userId)
  if (!row) throw new HttpError(404, 'That person is not a member of this project')
  refuseOnlyThroughTeams(row, teamNames, "Changing this person's role")
  // Their own role changes; a team's higher role still applies over it.
  const after = personRow(role, teamRoles)!.role
  // Promoting can never orphan a project; only demoting can.
  await assertNotTheLastAdmin(projectId, userId, 'Demoting this person', after)
  const updated = await prisma.$transaction(async (tx) => {
    await writePerson(tx, projectId, userId, role)
    return tx.projectMember.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId } } })
  })
  // A Viewer has no work done on their behalf (adr-0102): their open tasks here
  // wait for someone else, as when they leave, and a run in progress finishes.
  if (updated.role === 'VIEWER' && row.role !== 'VIEWER') {
    await handOverOpenTasks({ projectId, fromUserId: userId, destination: { kind: 'wait' }, actorId: context.user.id })
  }
  return updated
}

/**
 * Ends someone's membership in their own right while a team keeps them here:
 * they stay with the team's role, so nothing of their work moves, unless that
 * role is Viewer.
 */
async function stayThroughTeams(projectId: string, userId: string, actorId: string, roleBefore: ProjectRole) {
  const changed = await prisma.$transaction(tx => writePerson(tx, projectId, userId, null))
  if (changed.after === 'VIEWER' && roleBefore !== 'VIEWER') {
    await handOverOpenTasks({ projectId, fromUserId: userId, destination: { kind: 'wait' }, actorId })
  }
  return prisma.projectMember.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId } } })
}

/** Ends one person's membership: the row, a held instruction for each site holding their home there, and their conversations there. */
async function endMembership(projectId: string, userId: string) {
  const siteIds = await sitesForMemberInProject(projectId, userId)
  const removed = await prisma.$transaction(async tx => {
    const row = await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })
    await tx.heldSiteInstruction.createMany({
      data: heldInstructionRows(siteIds, { method: MEMBERSHIP_METHODS.memberLeftProject, params: { userId, projectId } }),
    })
    await closeProjectConversations(tx, projectId, 'LEFT_PROJECT', [userId])
    return row
  })
  // Not awaited: the removal has committed, and a site that is slow or down
  // gets the held instruction when it next connects.
  void deliverHeldInstructionsTo(siteIds)
  void declineWaitingInProject(projectId)
  // Their open live apps end at every relay at once (live preview spec section 6); a new stream is refused anyway.
  appTickets.revoke({ person: userId })
  // Their open screens leave the project's rooms: its tasks, boards, sessions and conversations.
  void leaveRoomsNoLongerAllowed([userId])
  return removed
}

/**
 * Removes a person from a project. Where the open tasks done on their behalf
 * here go is required, with no default (spec §3, People): another member, or
 * left waiting. The argument is optional in the type only so a screen built
 * before it still compiles; a call without it is refused.
 */
export const removeProjectMember = async (
  { projectId, userId, openTasks }: { projectId: string; userId: string; openTasks?: OpenTasksDestination },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayManageProjectPeople(projectId, context.user.id, 'Removing a person from this project')
  // Its owner can neither leave their personal project nor be removed from it.
  await refuseOnPersonalProject(projectId, 'Removing a person')
  let destination: OpenTasksDestination
  try {
    destination = parseOpenTasksDestination(openTasks)
  } catch (err) {
    throw new HttpError(400, (err as Error).message)
  }
  const { row, teamRoles, teamNames } = await standingOf(projectId, userId)
  refuseOnlyThroughTeams(row, teamNames, 'Removing this person')
  const staysAs = personRow(null, teamRoles)?.role ?? null
  await assertNotTheLastAdmin(projectId, userId, 'Removing this person', staysAs)
  if (staysAs !== null) return stayThroughTeams(projectId, userId, context.user.id, row!.role)
  await checkOpenTasksDestination(projectId, userId, destination)
  const removed = await endMembership(projectId, userId)
  await handOverOpenTasks({ projectId, fromUserId: userId, destination, actorId: context.user.id })
  return removed
}

/** Anyone in the organisation joins an open project in one step, as a Member (adr-0099). */
export const joinProject = async ({ projectId }: { projectId: string }, context: Ctx): Promise<{ ok: true }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accessLevel: true, personalOwnerId: true } })
  // A private project answers as a missing one: not seeing it is what being private means.
  if (!project || project.personalOwnerId || project.accessLevel !== 'OPEN') throw new HttpError(404, 'Project not found')
  if (!(await isActivePerson(context.user.id))) throw new HttpError(403, 'Joining a project requires being in the organisation')
  const userId = context.user.id
  await prisma.$transaction(async (tx) => {
    const row = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { direct: true } })
    if (!row?.direct) await writePerson(tx, projectId, userId, 'MEMBER')
  })
  return { ok: true }
}

/**
 * Leaves a project. Refused for its last admin. Their open tasks here are left
 * waiting, as no choice was asked of them; a project admin hands them on.
 */
export const leaveProject = async ({ projectId }: { projectId: string }, context: Ctx): Promise<{ ok: true }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  await refuseOnPersonalProject(projectId, 'Leaving')
  const { row, teamRoles, teamNames } = await standingOf(projectId, userId)
  refuseOnlyThroughTeams(row, teamNames, 'Leaving')
  const staysAs = personRow(null, teamRoles)?.role ?? null
  await assertNotTheLastAdmin(projectId, userId, 'Leaving', staysAs)
  if (staysAs !== null) {
    await stayThroughTeams(projectId, userId, userId, row!.role)
    return { ok: true }
  }
  await endMembership(projectId, userId)
  await handOverOpenTasks({ projectId, fromUserId: userId, destination: { kind: 'wait' }, actorId: userId })
  return { ok: true }
}

/**
 * Who may act is the member list whether the project is open or private
 * (adr-0099), so changing the access level changes only who may see and join
 * it, and ends nobody's access.
 */
export const setProjectAccessLevel = async (
  { projectId, accessLevel }: { projectId: string; accessLevel: 'OPEN' | 'PRIVATE' },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectAdmin(projectId, context.user.id, "Changing this project's access level")
  await refuseOnPersonalProject(projectId, 'Changing the access level')
  return prisma.project.update({ where: { id: projectId }, data: { accessLevel } })
}
