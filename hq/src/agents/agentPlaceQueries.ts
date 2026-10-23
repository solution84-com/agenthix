/**
 * The organisation's agents as a person uses them (every screen reviewed spec
 * §3, "An agent's place, and managing agents"): the Agents screen's cards, an
 * agent's place, and its profile card. Every agent is the organisation's, so
 * every member may read these; what an agent is doing is read only from the
 * projects the person can see, and their own parts — runs on their behalf,
 * their narrowing — are theirs alone.
 *
 * Usage is `getAgentUsage` (agentUsageQueries.ts); the
 * person's instructions are `getPlaceInstructions` with no project.
 */
import type { GetOrgAgents, GetAgentPlace, GetAgentProfile } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { SiteSilence } from '@agenthix/core'
import { entitledProjectsFilter } from '../projects/membership'
import { withDisplayReasons } from '../projects/taskReasonDisplay'
import { readRunUsage, lastRunBy } from '../sessions/runUsageRead'
import { getAgentOverride, narrowsAnything, overrideFromRow, type AgentOverrideValues } from './overrides/agentOverrideService'
import { AGENT_FACTS_SELECT, type AgentFacts } from './agentFacts'
import { readAgentWork, workOf } from './agentWork'
import { summariseNow, nowItems, comingUp, type AgentNow, type NowItem, type ComingUpItem, type TaskStateCounts } from './agentNow'
import { recentAgentRuns, onBehalfOf, type RecentRuns } from './agentRecentRuns'

export type AgentCard = {
  agent: AgentFacts
  now: AgentNow
  /** The projects it is assigned to that the person can see; personal spaces are not counted. */
  projectCount: number
  /** Assigned to a project the person is listed on; an open project they are not listed on does not count. */
  inMyProjects: boolean
  lastWorkedAt: string | null
}

export type OrgAgentsView = { agents: AgentCard[]; canManage: boolean; unanswered: SiteSilence[] }

export type AgentPlaceView = {
  agent: AgentFacts
  /** An organisation admin, who sees Manage ›. */
  canManage: boolean
  now: AgentNow
  nowItems: NowItem[]
  comingUp: ComingUpItem[]
  projects: Array<{
    project: { id: string; key: string; name: string }
    tasks: TaskStateCounts
    /** The project's model for it, when it narrows the agent's own. */
    modelHere: string | null
    narrowed: boolean
  }>
  /** The person's own narrowing of it, for their runs in their Chat. */
  yourNarrowing: AgentOverrideValues | null
  /** Its recent runs on the person's behalf. */
  recentRuns: RecentRuns
}

type VisibleProject = { id: string; key: string; name: string; personalOwnerId: string | null }

async function visibleProjects(userId: string): Promise<VisibleProject[]> {
  return prisma.project.findMany({
    where: entitledProjectsFilter(userId),
    select: { id: true, key: true, name: true, personalOwnerId: true },
    orderBy: { name: 'asc' },
  })
}

/** The shared projects the person is listed on as a member or admin. */
async function listedProjectIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.projectMember.findMany({
    where: { userId, project: { personalOwnerId: null } },
    select: { projectId: true },
  })
  return new Set(rows.map(r => r.projectId))
}

async function isOrgAdmin(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { role: true } })
  return settings?.role === 'ADMIN'
}

/** Every agent's visible assignments, by agent. */
async function assignmentsIn(projects: VisibleProject[], agentIds?: string[]): Promise<Map<string, string[]>> {
  const shared = projects.filter(p => !p.personalOwnerId).map(p => p.id)
  const rows = await prisma.projectAgent.findMany({
    where: { projectId: { in: shared }, ...(agentIds ? { agentId: { in: agentIds } } : {}) },
    select: { agentId: true, projectId: true },
  })
  const by = new Map<string, string[]>()
  for (const r of rows) by.set(r.agentId, [...(by.get(r.agentId) ?? []), r.projectId])
  return by
}

export const getOrgAgents: GetOrgAgents<{ filter?: 'all' | 'mine' } | undefined, OrgAgentsView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const [agents, projects, listed, canManage, usage] = await Promise.all([
    prisma.agent.findMany({ select: AGENT_FACTS_SELECT, orderBy: { name: 'asc' } }),
    visibleProjects(userId),
    listedProjectIds(userId),
    isOrgAdmin(userId),
    readRunUsage({ by: 'agent' }),
  ])
  const [assigned, work] = await Promise.all([
    assignmentsIn(projects),
    readAgentWork({ projectIds: projects.map(p => p.id) }),
  ])
  work.tasks = await withDisplayReasons(work.tasks)
  const lastRun = lastRunBy(usage.rows, row => row.agentId)
  const now = new Date()
  const cards = agents.map((agent): AgentCard => {
    const mine = workOf(work, agent.id)
    const inProjects = assigned.get(agent.id) ?? []
    return {
      agent,
      now: summariseNow(mine.tasks, mine.routines, now),
      projectCount: inProjects.length,
      inMyProjects: inProjects.some(id => listed.has(id)),
      lastWorkedAt: lastRun.get(agent.id) ?? null,
    }
  })
  return {
    agents: args?.filter === 'mine' ? cards.filter(c => c.inMyProjects) : cards,
    canManage,
    unanswered: usage.unanswered,
  }
}

async function agentFacts(agentId: string): Promise<AgentFacts> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: AGENT_FACTS_SELECT })
  if (!agent) throw new HttpError(404, 'Agent not found')
  return agent
}

/** The profile card: who it is, what it is doing now, how many projects. No site is asked. */
export const getAgentProfile: GetAgentProfile<{ agentId: string }, Omit<AgentCard, 'lastWorkedAt' | 'inMyProjects'>> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const agent = await agentFacts(args.agentId)
  const projects = await visibleProjects(context.user.id)
  const [assigned, work] = await Promise.all([
    assignmentsIn(projects, [agent.id]),
    readAgentWork({ projectIds: projects.map(p => p.id), agentIds: [agent.id] }),
  ])
  work.tasks = await withDisplayReasons(work.tasks)
  const mine = workOf(work, agent.id)
  return { agent, now: summariseNow(mine.tasks, mine.routines, new Date()), projectCount: assigned.get(agent.id)?.length ?? 0 }
}

export const getAgentPlace: GetAgentPlace<{ agentId: string }, AgentPlaceView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const agent = await agentFacts(args.agentId)
  const projects = await visibleProjects(userId)
  const [assigned, work, canManage, yourNarrowing, overrides, recentRuns] = await Promise.all([
    assignmentsIn(projects, [agent.id]),
    readAgentWork({ projectIds: projects.map(p => p.id), agentIds: [agent.id] }),
    isOrgAdmin(userId),
    getAgentOverride({ type: 'user', id: userId }, agent.id),
    prisma.agentOverride.findMany({ where: { agentId: agent.id, boundaryType: 'project', boundaryId: { in: projects.map(p => p.id) } } }),
    recentAgentRuns(userId, agent.id, onBehalfOf(userId)),
  ])
  work.tasks = await withDisplayReasons(work.tasks)
  const mine = workOf(work, agent.id)
  const now = new Date()
  const overrideBy = new Map(overrides.map(o => [o.boundaryId, o]))
  const inProjects = new Set(assigned.get(agent.id) ?? [])
  return {
    agent,
    canManage,
    now: summariseNow(mine.tasks, mine.routines, now),
    nowItems: nowItems(mine.tasks),
    comingUp: comingUp(mine.tasks, mine.routines, now),
    projects: projects.filter(p => inProjects.has(p.id)).map(p => {
      const o = overrideBy.get(p.id)
      return {
        project: { id: p.id, key: p.key, name: p.name },
        tasks: workOf(work, agent.id, p.id).counts,
        modelHere: null,
        narrowed: o ? narrowsAnything(overrideFromRow(o)) : false,
      }
    }),
    yourNarrowing,
    recentRuns,
  }
}
