/**
 * A project's Members as one list (`memberList.ts` holds the rules): its people, agents and teams read together, each
 * with where it comes from (adr-0103), then filtered, searched, sorted and paged. Read by its members, as the member
 * list is; one the person is not in answers as not found. hq's own records only.
 */
import type { GetProjectMemberList } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { mayManageProjectPeople, projectRole, isOrgAdmin } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { readPeopleWork } from './personWork'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'
import { readAgentWork, workOf } from '../agents/agentWork'
import { summariseNow } from '../agents/agentNow'
import { withDisplayReasons } from './taskReasonDisplay'
import {
  memberListPage, readMemberListArgs,
  type AgentMember, type MemberCounts, type MemberListArgs, type MemberListPage, type MemberRow, type PersonMember, type TeamMember, type TeamRef,
} from './memberList'

type Ctx = { user?: { id: string } | null }

export type ProjectMemberList = MemberListPage & {
  project: { id: string; key: string; name: string; accessLevel: 'OPEN' | 'PRIVATE'; personal: boolean }
  /** The whole project, whatever is searched: the header's "N people · N agents · N teams". */
  totals: MemberCounts
  /** May add, change and remove people and teams here. */
  canManagePeople: boolean
  /** May assign and remove agents here. */
  canAssignAgents: boolean
}

function latest(dates: (Date | null)[]): Date | null {
  let last: Date | null = null
  for (const d of dates) if (d !== null && (last === null || d > last)) last = d
  return last
}

/** When each agent last worked on a task here. */
async function lastWorkedOf(projectId: string, agentIds: string[]): Promise<Map<string, Date | null>> {
  if (agentIds.length === 0) return new Map()
  const groups = await prisma.task.groupBy({ by: ['assignedAgentId'], where: { projectId, assignedAgentId: { in: agentIds } }, _max: { lastWorkedAt: true } })
  return new Map(groups.map((g): [string, Date | null] => [g.assignedAgentId ?? '', g._max.lastWorkedAt]))
}

/** Everyone on the list, unpaged: the three tables merged, each row with the teams that bring it here. */
async function allRows(projectId: string, meId: string, project: { leadUserId: string | null; defaultAgentId: string | null }): Promise<MemberRow[]> {
  const [teamRows, members, assigned] = await Promise.all([
    prisma.projectTeam.findMany({
      where: { projectId },
      select: {
        role: true, addedById: true, createdAt: true,
        team: { select: { id: true, name: true, avatarUrl: true, people: { select: { userId: true } }, agents: { select: { agentId: true } } } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId, user: ACTIVE_PERSON },
      select: { userId: true, role: true, direct: true, ownRole: true, createdAt: true },
    }),
    prisma.projectAgent.findMany({
      where: { projectId },
      select: { direct: true, createdAt: true, agent: { select: { id: true, name: true, handle: true, role: true, avatarUrl: true } } },
    }),
  ])
  const userIds = members.map(m => m.userId)
  const agentIds = assigned.map(a => a.agent.id)
  const [people, peopleWork, agentWork, agentLastWorked, adders] = await Promise.all([
    peopleByIds(userIds),
    readPeopleWork(projectId, userIds),
    readAgentWork({ projectIds: [projectId], agentIds }),
    lastWorkedOf(projectId, agentIds),
    peopleByIds(teamRows.map(t => t.addedById).filter((id): id is string => id !== null)),
  ])
  agentWork.tasks = await withDisplayReasons(agentWork.tasks)
  const now = new Date()
  const refOf = (t: (typeof teamRows)[number]): TeamRef => ({ id: t.team.id, name: t.team.name, role: t.role })
  const teamsOfPerson = (userId: string) => teamRows.filter(t => t.team.people.some(p => p.userId === userId)).map(refOf)
  const teamsOfAgent = (agentId: string) => teamRows.filter(t => t.team.agents.some(a => a.agentId === agentId)).map(refOf)
  const lastWorked = agentLastWorked

  const personRows = members.map((m): PersonMember => {
    const person = people.get(m.userId)!
    const work = peopleWork.get(m.userId)!
    return {
      kind: 'person', id: m.userId, name: person.name, handle: person.handle, avatarUrl: person.avatarUrl,
      role: m.role, ownRole: m.direct ? m.ownRole ?? m.role : null, teams: teamsOfPerson(m.userId),
      isLead: project.leadUserId === m.userId, isMe: m.userId === meId,
      addedAt: m.createdAt, lastActiveAt: work.lastActiveAt, now: work.now,
    }
  })
  const agentRows = assigned.map(({ agent, direct, createdAt }): AgentMember => {
    const mine = workOf(agentWork, agent.id, projectId)
    return {
      kind: 'agent', id: agent.id, name: agent.name, handle: agent.handle, description: agent.role, avatarUrl: agent.avatarUrl,
      isDefault: project.defaultAgentId === agent.id, direct, teams: teamsOfAgent(agent.id),
      addedAt: createdAt, lastActiveAt: lastWorked.get(agent.id) ?? null, now: summariseNow(mine.tasks, mine.routines, now),
    }
  })
  const here = new Set(userIds)
  const teams = teamRows.map((t): TeamMember => {
    const inIt = new Set([...t.team.people.map(p => p.userId), ...t.team.agents.map(a => a.agentId)])
    return {
      kind: 'team', id: t.team.id, name: t.team.name, avatarUrl: t.team.avatarUrl, role: t.role,
      peopleCount: t.team.people.filter(p => here.has(p.userId)).length, agentCount: t.team.agents.length,
      addedBy: t.addedById ? adders.get(t.addedById)?.name ?? null : null,
      addedAt: t.createdAt,
      lastActiveAt: latest([...personRows, ...agentRows].filter(r => inIt.has(r.id)).map(r => r.lastActiveAt)),
    }
  })
  return [...personRows, ...agentRows, ...teams]
}

export const getProjectMemberList: GetProjectMemberList<{ projectId: string } & MemberListArgs, ProjectMemberList> = async (args, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  if (typeof args?.projectId !== 'string') throw new HttpError(400, 'A project is named by its id')
  let options: ReturnType<typeof readMemberListArgs>
  try {
    options = readMemberListArgs(args as unknown as Record<string, unknown>)
  } catch (err) {
    throw new HttpError(400, (err as Error).message)
  }
  await requireProjectVisible(args.projectId, userId)
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: args.projectId },
    select: { id: true, key: true, name: true, accessLevel: true, personalOwnerId: true, leadUserId: true, defaultAgentId: true },
  })
  const personal = project.personalOwnerId !== null
  const [rows, managesPeople, role, orgAdmin] = await Promise.all([
    allRows(project.id, userId, project),
    mayManageProjectPeople(project.id, userId),
    projectRole(project.id, userId),
    isOrgAdmin(userId),
  ])
  const page = memberListPage(rows, options)
  return {
    project: { id: project.id, key: project.key, name: project.name, accessLevel: project.accessLevel, personal },
    totals: {
      everyone: rows.length,
      people: rows.filter(r => r.kind === 'person').length,
      agents: rows.filter(r => r.kind === 'agent').length,
      teams: rows.filter(r => r.kind === 'team').length,
    },
    canManagePeople: managesPeople && !personal,
    // As `requireMayAssignAgents` decides.
    canAssignAgents: role === 'ADMIN' || (orgAdmin && !personal),
    ...page,
  }
}
