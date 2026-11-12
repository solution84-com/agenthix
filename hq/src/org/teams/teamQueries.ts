/**
 * Reading teams (every screen reviewed spec §3, Organisation): every signed-in
 * person sees the organisation's teams and who is in them. Where a team works
 * names only the projects the reader can see; a private one they are not in is
 * counted, never named (adr-0062).
 *
 * A project's teams, and which of its people and agents are there through
 * them, are read by its members, as its member list is (`memberQueries.ts`).
 */
import { HttpError, prisma } from 'wasp/server'
import { peopleByIds } from '../../server/identity/people'
import type { PersonSummary } from '../../server/identity/personSummary'
import { visibleProjectsFilter } from '../../projects/membership'
import { requireProjectVisible } from '../../projects/resourceEntitlement'
import type { ProjectRole } from './teamRoles'
import { hideOtherVisitors } from '../../demo/visitors'
import type { Prisma } from '@prisma/client'
import type { PictureRecipeView } from '@agenthix/core'
import { recipeView } from '../../pictures/recipeView'

type Ctx = { user?: { id: string } | null }

type TeamAgentRef = { id: string; name: string; handle: string; avatarUrl: string | null }

export type TeamSummary = {
  id: string
  name: string
  purpose: string
  avatarUrl: string | null
  coverUrl: string | null
  people: PersonSummary[]
  agents: TeamAgentRef[]
  userIds: string[]
  agentIds: string[]
  /** Every project it is in, private ones included: a count names nothing. */
  projectCount: number
}

export type TeamDetail = TeamSummary & {
  /** The recipes its pictures were drawn from, for the picker; null for an upload. */
  avatarRecipe: PictureRecipeView | null
  coverRecipe: PictureRecipeView | null
  projects: Array<{ id: string; name: string; key: string; role: ProjectRole }>
  /** Projects it is in that the reader cannot see. */
  privateProjects: number
}

const TEAM_SELECT = {
  id: true, name: true, purpose: true, avatarUrl: true, coverUrl: true, avatarRecipe: true, coverRecipe: true,
  people: { select: { userId: true }, orderBy: { createdAt: 'asc' as const } },
  agents: { select: { agent: { select: { id: true, name: true, handle: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' as const } },
  _count: { select: { projects: true } },
} as const

type TeamRow = {
  id: string; name: string; purpose: string; avatarUrl: string | null; coverUrl: string | null
  avatarRecipe: Prisma.JsonValue | null; coverRecipe: Prisma.JsonValue | null
  people: { userId: string }[]
  agents: { agent: TeamAgentRef }[]
  _count: { projects: number }
}

function summarise(team: TeamRow, people: Map<string, PersonSummary>): TeamSummary {
  const userIds = team.people.map(p => p.userId)
  return {
    id: team.id, name: team.name, purpose: team.purpose, avatarUrl: team.avatarUrl, coverUrl: team.coverUrl,
    people: userIds.map(id => people.get(id)!),
    agents: team.agents.map(a => a.agent),
    userIds,
    agentIds: team.agents.map(a => a.agent.id),
    projectCount: team._count.projects,
  }
}

export const getTeams = async (_args: unknown, context: Ctx): Promise<TeamSummary[]> => {
  if (!context.user) throw new HttpError(401)
  const teams = await prisma.team.findMany({ select: TEAM_SELECT, orderBy: { createdAt: 'asc' } })
  const people = await peopleByIds(teams.flatMap(t => t.people.map(p => p.userId)))
  return teams.map(t => summarise(t, people))
}

export const getTeam = async ({ id }: { id: string }, context: Ctx): Promise<TeamDetail> => {
  if (!context.user) throw new HttpError(401)
  const team = await prisma.team.findUnique({ where: { id }, select: TEAM_SELECT })
  if (!team) throw new HttpError(404, 'Team not found')
  const [people, visible] = await Promise.all([
    peopleByIds(team.people.map(p => p.userId)),
    prisma.projectTeam.findMany({
      where: { teamId: id, project: visibleProjectsFilter(context.user.id) },
      select: { role: true, project: { select: { id: true, name: true, key: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return {
    ...summarise(team, people),
    avatarRecipe: recipeView(team.avatarRecipe),
    coverRecipe: recipeView(team.coverRecipe),
    projects: visible.map(v => ({ ...v.project, role: v.role })),
    privateProjects: team._count.projects - visible.length,
  }
}

export type ProjectTeams = {
  teams: Array<{
    id: string
    name: string
    purpose: string
    avatarUrl: string | null
    coverUrl: string | null
    role: ProjectRole
    addedBy: PersonSummary | null
    addedAt: Date
    userIds: string[]
    agentIds: string[]
  }>
  /** Each member's own standing: in their own right (with their own role) or not, and the teams they are here through. */
  people: Array<{ userId: string; direct: boolean; ownRole: ProjectRole | null; teamIds: string[] }>
  agents: Array<{ agentId: string; direct: boolean; teamIds: string[] }>
}

export const getProjectTeams = async ({ projectId }: { projectId: string }, context: Ctx): Promise<ProjectTeams> => {
  if (!context.user) throw new HttpError(401)
  await requireProjectVisible(projectId, context.user.id)
  const [rows, members, agents] = await Promise.all([
    prisma.projectTeam.findMany({
      where: { projectId },
      select: {
        role: true, addedById: true, createdAt: true,
        team: { select: { id: true, name: true, purpose: true, avatarUrl: true, coverUrl: true, people: { select: { userId: true } }, agents: { select: { agentId: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectMember.findMany({ where: { projectId, user: hideOtherVisitors(context.user.id) }, select: { userId: true, role: true, direct: true, ownRole: true } }),
    prisma.projectAgent.findMany({ where: { projectId }, select: { agentId: true, direct: true } }),
  ])
  const adders = await peopleByIds(rows.map(r => r.addedById).filter((id): id is string => id !== null))
  const teamsOf = (has: (t: (typeof rows)[number]['team']) => boolean) => rows.filter(r => has(r.team)).map(r => r.team.id)
  return {
    teams: rows.map(r => ({
      id: r.team.id, name: r.team.name, purpose: r.team.purpose, avatarUrl: r.team.avatarUrl, coverUrl: r.team.coverUrl,
      role: r.role,
      addedBy: r.addedById ? adders.get(r.addedById) ?? null : null,
      addedAt: r.createdAt,
      userIds: r.team.people.map(p => p.userId).filter(id => members.some(m => m.userId === id)),
      agentIds: r.team.agents.map(a => a.agentId),
    })),
    people: members.map(m => ({
      userId: m.userId,
      direct: m.direct,
      ownRole: m.direct ? m.ownRole ?? m.role : null,
      teamIds: teamsOf(t => t.people.some(p => p.userId === m.userId)),
    })),
    agents: agents.map(a => ({ agentId: a.agentId, direct: a.direct, teamIds: teamsOf(t => t.agents.some(x => x.agentId === a.agentId)) })),
  }
}
