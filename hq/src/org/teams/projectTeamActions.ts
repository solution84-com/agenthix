/**
 * A team as one member of a project (adr-0103): added with one project role,
 * its role changed, and removed as a unit. Each is a change to where the
 * project's memberships come from, written through to its people and agents
 * (`membershipChange.ts`).
 *
 * Who may: whoever may change the project's people (`mayManageProjectPeople`)
 * — its admins, and the organisation's admins in a project they can see. A
 * person's own project takes no team.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireMayManageProjectPeople } from '../../projects/membership'
import { refuseOnPersonalProject } from '../../projects/personalProject'
import { parseOpenTasksDestination, type OpenTasksDestination } from '../../projects/openTasksDestination'
import { changeMemberships, type LeavingChoice } from './membershipChange'
import type { ProjectRole } from './teamRoles'

type Ctx = { user?: { id: string } | null }

const ROLES: readonly ProjectRole[] = ['ADMIN', 'MEMBER', 'VIEWER']

function parseRole(role: unknown): ProjectRole {
  if (!ROLES.includes(role as ProjectRole)) throw new HttpError(400, "A team's role in a project is Admin, Member or Viewer")
  return role as ProjectRole
}

async function requireMayChange(projectId: string, context: Ctx, what: string): Promise<string> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayManageProjectPeople(projectId, context.user.id, what)
  await refuseOnPersonalProject(projectId, what)
  return context.user.id
}

async function membersOf(teamId: string): Promise<{ userIds: string[]; agentIds: string[] }> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { people: { select: { userId: true } }, agents: { select: { agentId: true } } },
  })
  if (!team) throw new HttpError(404, 'Team not found')
  return { userIds: team.people.map(p => p.userId), agentIds: team.agents.map(a => a.agentId) }
}

async function requireTeamInProject(projectId: string, teamId: string): Promise<void> {
  const row = await prisma.projectTeam.findUnique({ where: { projectId_teamId: { projectId, teamId } } })
  if (!row) throw new HttpError(404, 'That team is not a member of this project')
}

export const addTeamToProject = async (
  { projectId, teamId, role = 'MEMBER' }: { projectId: string; teamId: string; role?: ProjectRole },
  context: Ctx,
): Promise<{ ok: true }> => {
  const actorId = await requireMayChange(projectId, context, 'Adding a team to this project')
  const teamRole = parseRole(role)
  const { userIds, agentIds } = await membersOf(teamId)
  if (await prisma.projectTeam.findUnique({ where: { projectId_teamId: { projectId, teamId } } })) {
    throw new HttpError(409, 'That team is already a member of this project; change its role instead')
  }
  await changeMemberships({
    projectIds: [projectId], userIds, agentIds, actorId,
    change: tx => tx.projectTeam.create({ data: { projectId, teamId, role: teamRole, addedById: actorId } }).then(() => undefined),
  })
  return { ok: true }
}

export const setProjectTeamRole = async (
  { projectId, teamId, role }: { projectId: string; teamId: string; role: ProjectRole },
  context: Ctx,
): Promise<{ ok: true }> => {
  const actorId = await requireMayChange(projectId, context, "Changing a team's role in this project")
  const teamRole = parseRole(role)
  await requireTeamInProject(projectId, teamId)
  const { userIds, agentIds } = await membersOf(teamId)
  await changeMemberships({
    projectIds: [projectId], userIds, agentIds, actorId,
    change: tx => tx.projectTeam.update({ where: { projectId_teamId: { projectId, teamId } }, data: { role: teamRole } }).then(() => undefined),
  })
  return { ok: true }
}

const isIdOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v !== '')

/**
 * Removes a team, and with it everyone there only through it; anyone also
 * there in person or through another team stays (adr-0103). As removing a
 * person or an agent does, it takes where the open tasks of those leaving go,
 * with no default: `openTasks` for its people, `agentOpenTasksTo` for its
 * agents (both optional in the type only, and refused when left out).
 */
export const removeTeamFromProject = async (
  args: {
    projectId: string
    teamId: string
    openTasks?: OpenTasksDestination
    agentOpenTasksTo?: string | null
    newDefaultAgentId?: string | null
  },
  context: Ctx,
): Promise<{ left: { people: string[]; agents: string[] } }> => {
  const actorId = await requireMayChange(args.projectId, context, 'Removing a team from this project')
  let openTasks: OpenTasksDestination
  try {
    openTasks = parseOpenTasksDestination(args.openTasks)
  } catch (err) {
    throw new HttpError(400, (err as Error).message)
  }
  if (!isIdOrNull(args.agentOpenTasksTo)) {
    throw new HttpError(400, "Say what happens to its agents' open tasks here: another agent in the project, or none")
  }
  if (args.newDefaultAgentId !== undefined && !isIdOrNull(args.newDefaultAgentId)) {
    throw new HttpError(400, 'The new default agent is another agent in the project, or none')
  }
  await requireTeamInProject(args.projectId, args.teamId)
  const { userIds, agentIds } = await membersOf(args.teamId)
  const choice: LeavingChoice = { openTasks, agentOpenTasksTo: args.agentOpenTasksTo, newDefaultAgentId: args.newDefaultAgentId }
  const [outcome] = await changeMemberships({
    projectIds: [args.projectId], userIds, agentIds, actorId,
    choices: new Map([[args.projectId, choice]]),
    change: tx => tx.projectTeam.delete({ where: { projectId_teamId: { projectId: args.projectId, teamId: args.teamId } } }).then(() => undefined),
  })
  return {
    left: {
      people: outcome.people.filter(p => p.before !== null && p.after === null).map(p => p.userId),
      agents: outcome.agents.filter(a => a.before && !a.after).map(a => a.agentId),
    },
  }
}
