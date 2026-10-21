/**
 * Teams (every screen reviewed spec §3, Organisation): a group of people and
 * agents with a purpose, made and changed by the organisation's admins.
 *
 * A change to a team's people or agents follows it into every project it is in
 * (adr-0103): someone added joins them, someone taken out leaves those they
 * were in only through the team. Nobody is asked about the work of those who
 * leave this way, so it goes as when a person leaves a project themselves:
 * their open tasks wait, a leaving agent's open tasks have no agent, and a
 * leaving default agent leaves the project with none.
 *
 * Changing a team's people changes who is in its projects, so it needs, in
 * each of them, what changing that project's people needs
 * (`mayManageProjectPeople`): an organisation admin may not reach into a
 * private project they are not in by way of a team.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../../server/identity/requireRole'
import { requireMayManageProjectPeople } from '../../projects/membership'
import { changeMemberships } from './membershipChange'
import type { Tx } from './writeThrough'

type Ctx = { user?: { id: string } | null }

const MAX_NAME = 80
const MAX_PURPOSE = 500

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!value) throw new HttpError(400, 'A team needs a name')
  if (value.length > MAX_NAME) throw new HttpError(400, `A team's name is at most ${MAX_NAME} characters`)
  return value
}

function cleanPurpose(purpose: unknown): string {
  const value = typeof purpose === 'string' ? purpose.trim() : ''
  if (value.length > MAX_PURPOSE) throw new HttpError(400, `A team's purpose is at most ${MAX_PURPOSE} characters`)
  return value
}

function ids(list: unknown, what: string): string[] {
  if (!Array.isArray(list) || list.some(id => typeof id !== 'string' || id === '')) throw new HttpError(400, `${what} must be a list of ids`)
  return [...new Set(list as string[])]
}

async function requirePeopleActive(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const found = await prisma.user.count({ where: { id: { in: userIds }, deactivatedAt: null } })
  if (found !== userIds.length) throw new HttpError(400, 'Only people in the organisation can be in a team')
}

async function requireAgentsExist(agentIds: string[]): Promise<void> {
  if (agentIds.length === 0) return
  const found = await prisma.agent.count({ where: { id: { in: agentIds } } })
  if (found !== agentIds.length) throw new HttpError(400, 'One of those agents does not exist')
}

async function setMembers(tx: Tx, teamId: string, userIds: string[] | null, agentIds: string[] | null): Promise<void> {
  if (userIds) {
    await tx.teamPerson.deleteMany({ where: { teamId, userId: { notIn: userIds } } })
    await tx.teamPerson.createMany({ data: userIds.map(userId => ({ teamId, userId })), skipDuplicates: true })
  }
  if (agentIds) {
    await tx.teamAgent.deleteMany({ where: { teamId, agentId: { notIn: agentIds } } })
    await tx.teamAgent.createMany({ data: agentIds.map(agentId => ({ teamId, agentId })), skipDuplicates: true })
  }
}

export const createTeam = async (
  args: { name: string; purpose?: string; userIds?: string[]; agentIds?: string[] },
  context: Ctx,
): Promise<{ id: string }> => {
  await requireRole(context, 'ADMIN', 'Managing teams')
  const name = cleanName(args.name)
  const purpose = cleanPurpose(args.purpose)
  const userIds = ids(args.userIds ?? [], 'People')
  const agentIds = ids(args.agentIds ?? [], 'Agents')
  await requirePeopleActive(userIds)
  await requireAgentsExist(agentIds)
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({ data: { name, purpose, createdBy: context.user!.id } })
    await setMembers(tx, team.id, userIds, agentIds)
    return { id: team.id }
  })
}

/**
 * Changes a team: its name and purpose, and — when given — exactly who is in
 * it, `userIds` and `agentIds` each replacing the whole list.
 */
export const updateTeam = async (
  args: { id: string; name?: string; purpose?: string; userIds?: string[]; agentIds?: string[] },
  context: Ctx,
): Promise<{ id: string }> => {
  await requireRole(context, 'ADMIN', 'Managing teams')
  const actorId = context.user!.id
  const team = await prisma.team.findUnique({
    where: { id: args.id },
    select: { people: { select: { userId: true } }, agents: { select: { agentId: true } }, projects: { select: { projectId: true } } },
  })
  if (!team) throw new HttpError(404, 'Team not found')
  const data = {
    ...(args.name !== undefined ? { name: cleanName(args.name) } : {}),
    ...(args.purpose !== undefined ? { purpose: cleanPurpose(args.purpose) } : {}),
  }
  const userIds = args.userIds === undefined ? null : ids(args.userIds, 'People')
  const agentIds = args.agentIds === undefined ? null : ids(args.agentIds, 'Agents')
  if (userIds) await requirePeopleActive(userIds.filter(id => !team.people.some(p => p.userId === id)))
  if (agentIds) await requireAgentsExist(agentIds)

  const before = { userIds: team.people.map(p => p.userId), agentIds: team.agents.map(a => a.agentId) }
  const peopleChange = userIds !== null && !sameSet(before.userIds, userIds)
  const projectIds = team.projects.map(p => p.projectId)
  if (peopleChange) {
    for (const projectId of projectIds) await requireMayManageProjectPeople(projectId, actorId, "Changing the people of a team in this project")
  }

  await changeMemberships({
    projectIds,
    userIds: [...before.userIds, ...(userIds ?? [])],
    agentIds: [...before.agentIds, ...(agentIds ?? [])],
    actorId,
    change: async (tx) => {
      if (Object.keys(data).length > 0) await tx.team.update({ where: { id: args.id }, data })
      await setMembers(tx, args.id, userIds, agentIds)
    },
  })
  return { id: args.id }
}

/** A team still in a project is refused: removing it there asks about its members' open tasks first. */
export const deleteTeam = async ({ id }: { id: string }, context: Ctx): Promise<void> => {
  await requireRole(context, 'ADMIN', 'Managing teams')
  const projects = await prisma.projectTeam.count({ where: { teamId: id } })
  if (projects > 0) {
    throw new HttpError(409, `This team works in ${projects} project${projects === 1 ? '' : 's'}. Remove it from each first.`)
  }
  await prisma.team.deleteMany({ where: { id } })
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a)
  return left.size === new Set(b).size && b.every(id => left.has(id))
}
