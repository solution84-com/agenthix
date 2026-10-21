/**
 * A project's Agents tool (every screen reviewed spec §3): its agents as they
 * work in this project. Every read needs membership of the project; one the
 * person is not on answers as not found, like the project itself.
 *
 * "In this project" — the project's narrowing of an agent — is shown to every
 * member; changing it stays with the project's admins (`overrideOperations.ts`).
 * A personal project's runs take its person's own narrowing (spec §4), so that
 * is what is shown there, to its person, the only one who can see it.
 *
 * Its instructions here are `getPlaceInstructions` (storage/placeInstructions.ts).
 */
import type { GetProjectAgents, GetProjectAgent } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { ToolPermission } from '@agenthix/core'
import { requireProjectVisible } from '../projects/resourceEntitlement'
import { withDisplayReasons } from '../projects/taskReasonDisplay'
import { getAgentOverride, narrowsAnything, type AgentOverrideValues, type OverrideBoundary } from './overrides/agentOverrideService'
import { AGENT_FACTS_SELECT, type AgentFacts } from './agentFacts'
import { readAgentWork, workOf } from './agentWork'
import { summariseNow, nowItems, comingUp, type AgentNow, type NowItem, type ComingUpItem, type TaskStateCounts } from './agentNow'
import { recentAgentRuns, inProject, type RecentRuns } from './agentRecentRuns'

export type ModelHere = { own: string; here: string; narrowed: boolean }

export type ProjectAgentRow = {
  agent: AgentFacts
  assignedAt: Date
  isDefault: boolean
  now: AgentNow
  tasks: TaskStateCounts
  model: ModelHere
  /** Whether this project narrows it at all — model, approval, tools or bash patterns. */
  narrowed: boolean
}

export type ProjectAgentsView = {
  project: { id: string; key: string; name: string; personal: boolean }
  /** The person may assign, remove and change "In this project". */
  canManage: boolean
  agents: ProjectAgentRow[]
}

export type ProjectAgentView = ProjectAgentRow & {
  project: ProjectAgentsView['project']
  canManage: boolean
  nowItems: NowItem[]
  comingUp: ComingUpItem[]
  inThisProject: {
    own: { model: string; approval: string; allowedTools: ToolPermission[] | null }
    narrowing: AgentOverrideValues | null
  }
  recentRuns: RecentRuns
}

async function projectHere(projectId: string, userId: string) {
  await requireProjectVisible(projectId, userId)
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, key: true, name: true, personalOwnerId: true, defaultAgentId: true },
  })
  const role = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }, select: { role: true },
  })
  const boundary: OverrideBoundary = project.personalOwnerId
    ? { type: 'user', id: project.personalOwnerId }
    : { type: 'project', id: projectId }
  return {
    view: { id: project.id, key: project.key, name: project.name, personal: project.personalOwnerId !== null },
    defaultAgentId: project.defaultAgentId,
    canManage: role?.role === 'ADMIN',
    boundary,
  }
}

function modelHere(agent: AgentFacts, narrowing: AgentOverrideValues | null): ModelHere {
  const here = narrowing?.model ?? agent.defaultModel
  return { own: agent.defaultModel, here, narrowed: here !== agent.defaultModel }
}

async function rowFor(
  agent: AgentFacts, assignedAt: Date, here: Awaited<ReturnType<typeof projectHere>>,
  work: Awaited<ReturnType<typeof readAgentWork>>, now: Date,
) {
  const narrowing = await getAgentOverride(here.boundary, agent.id)
  const mine = workOf(work, agent.id, here.view.id)
  const row: ProjectAgentRow = {
    agent,
    assignedAt,
    isDefault: here.defaultAgentId === agent.id,
    now: summariseNow(mine.tasks, mine.routines, now),
    tasks: mine.counts,
    model: modelHere(agent, narrowing),
    narrowed: narrowsAnything(narrowing),
  }
  return { row, narrowing, mine }
}

export const getProjectAgents: GetProjectAgents<{ projectId: string }, ProjectAgentsView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const here = await projectHere(args.projectId, context.user.id)
  const assigned = await prisma.projectAgent.findMany({
    where: { projectId: args.projectId },
    select: { createdAt: true, agent: { select: AGENT_FACTS_SELECT } },
    orderBy: { createdAt: 'asc' },
  })
  const work = await readAgentWork({ projectIds: [args.projectId], agentIds: assigned.map(a => a.agent.id) })
  work.tasks = await withDisplayReasons(work.tasks)
  const now = new Date()
  const rows = await Promise.all(assigned.map(async (a) => (await rowFor(a.agent, a.createdAt, here, work, now)).row))
  return { project: here.view, canManage: here.canManage, agents: rows }
}

export const getProjectAgent: GetProjectAgent<{ projectId: string; agentId: string }, ProjectAgentView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const here = await projectHere(args.projectId, userId)
  const assignment = await prisma.projectAgent.findUnique({
    where: { projectId_agentId: { projectId: args.projectId, agentId: args.agentId } },
    select: { createdAt: true, agent: { select: { ...AGENT_FACTS_SELECT, allowedTools: true } } },
  })
  if (!assignment) throw new HttpError(404, 'That agent is not assigned to this project')
  const { allowedTools, ...agent } = assignment.agent
  const work = await readAgentWork({ projectIds: [args.projectId], agentIds: [agent.id] })
  work.tasks = await withDisplayReasons(work.tasks)
  const now = new Date()
  const { row, narrowing, mine } = await rowFor(agent, assignment.createdAt, here, work, now)
  const recentRuns = await recentAgentRuns(userId, agent.id, inProject(args.projectId))
  return {
    ...row,
    project: here.view,
    canManage: here.canManage,
    nowItems: nowItems(mine.tasks),
    comingUp: comingUp(mine.tasks, mine.routines, now),
    inThisProject: { own: { model: agent.defaultModel, approval: agent.approval, allowedTools: (allowedTools ?? null) as ToolPermission[] | null }, narrowing },
    recentRuns,
  }
}
