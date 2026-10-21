/**
 * Organisation › Agents' Projects (every screen reviewed spec §3): where an
 * agent is assigned, with each project's narrowing of it, and the projects it
 * could be assigned to. Organisation admins only.
 *
 * A private project stays private to organisation admins (adr-0062): one the
 * admin is not on is counted, so they see how many projects the agent works
 * in, but never named — no name, no key, no narrowing. Assign offers only the
 * projects the admin can see, though `addAgentToProject` itself still lets an
 * organisation admin assign to any project but a person's own.
 *
 * A person's own space is never listed by name either: it is theirs, and an
 * organisation admin cannot assign into it. Only how many there are is said.
 */
import type { GetAgentAssignments } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { entitledProjectsFilter } from '../projects/membership'
import { overrideFromRow, type AgentOverrideValues } from './overrides/agentOverrideService'
import { AGENT_FACTS_SELECT, type AgentFacts } from './agentFacts'

type ProjectRef = { id: string; name: string; key: string; accessLevel: 'OPEN' | 'PRIVATE' }

export type AgentAssignmentsView = {
  agent: AgentFacts
  assignments: Array<{
    project: ProjectRef
    assignedAt: Date
    /** The project's narrowing of the agent ("In this project"), or null when it narrows nothing. */
    narrowing: AgentOverrideValues | null
  }>
  /** Private projects it is in that the admin is not on: shown as "A private project" each, never named. */
  privateProjects: number
  personalSpaces: number
  /** Projects the admin can see that it is not assigned to yet, for Assign. */
  assignable: ProjectRef[]
}

const PROJECT_REF = { id: true, name: true, key: true, accessLevel: true } as const

export const getAgentAssignments: GetAgentAssignments<{ agentId: string }, AgentAssignmentsView> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Listing an agent's projects")
  const userId = context.user!.id
  const agent = await prisma.agent.findUnique({ where: { id: args.agentId }, select: AGENT_FACTS_SELECT })
  if (!agent) throw new HttpError(404, 'Agent not found')

  const [rows, overrides, assignable] = await Promise.all([
    prisma.projectAgent.findMany({
      where: { agentId: agent.id },
      select: { createdAt: true, project: { select: { ...PROJECT_REF, personalOwnerId: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.agentOverride.findMany({ where: { agentId: agent.id, boundaryType: 'project' } }),
    prisma.project.findMany({
      where: { personalOwnerId: null, agents: { none: { agentId: agent.id } }, ...entitledProjectsFilter(userId) },
      select: PROJECT_REF,
      orderBy: { name: 'asc' },
    }),
  ])
  const shared = rows.filter(r => r.project.personalOwnerId === null)
  const visible = new Set((await prisma.project.findMany({
    where: { id: { in: shared.map(r => r.project.id) }, ...entitledProjectsFilter(userId) },
    select: { id: true },
  })).map(p => p.id))
  const seen = shared.filter(r => visible.has(r.project.id))
  const narrowingBy = new Map(overrides.filter(o => visible.has(o.boundaryId)).map(o => [o.boundaryId, overrideFromRow(o)]))

  return {
    agent,
    assignments: seen.map(({ createdAt, project: { personalOwnerId: _personal, ...project } }) => ({
      project,
      assignedAt: createdAt,
      narrowing: narrowingBy.get(project.id) ?? null,
    })),
    privateProjects: shared.length - seen.length,
    personalSpaces: rows.length - shared.length,
    assignable,
  }
}
