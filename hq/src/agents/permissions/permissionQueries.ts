/**
 * The reads behind the permissions screens and the agent's card in context (every screen reviewed spec §3). Each
 * reads hq's own records only, so none asks a site.
 *
 * Who reads what: the organisation's permissions are its admins', who change them (updateAgentSettings); a
 * project's narrowing every member of the project reads and its admins change; a person's only that person. A
 * personal project's runs take its person's own narrowing (spec §4), so the card opened in one shows theirs.
 */
import type { GetAgentPermissions, GetAgentPermissionsHere, GetAgentCardHere } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../../server/identity/requireRole'
import { projectRole, requireProjectMember } from '../../projects/membership'
import { authorizeBoundary } from '../overrides/overrideOperations'
import { getAgentOverride, organisationPermissions, type OverrideBoundary } from '../overrides/agentOverrideService'
import { readAgentWork, workOf } from '../agentWork'
import { narrowingView, organisationView, type OrganisationPermissionsView, type PermissionsHereView } from './permissionViews'

const PERMISSION_FIELDS = { id: true, approval: true, allowedTools: true, allowedBashPatterns: true } as const

async function agentPermissionsRow(agentId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: PERMISSION_FIELDS })
  if (!agent) throw new HttpError(404, 'Agent not found')
  return agent
}

export type AgentPermissionsView = OrganisationPermissionsView & { agentId: string; canChange: boolean }

export const getAgentPermissions: GetAgentPermissions<{ agentId: string }, AgentPermissionsView> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Viewing an agent's permissions")
  const agent = await agentPermissionsRow(args.agentId)
  return { agentId: agent.id, canChange: true, ...organisationView(organisationPermissions(agent)) }
}

export type AgentPermissionsHereView = PermissionsHereView & {
  agentId: string
  boundary: OverrideBoundary
  /** The person may change this level: a project's admin, or the person for their own. */
  canChange: boolean
}

type HereArgs = { agentId: string; boundaryType: 'project' | 'user'; boundaryId: string }

export const getAgentPermissionsHere: GetAgentPermissionsHere<HereArgs, AgentPermissionsHereView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const boundary = await authorizeBoundary(args, userId, "Viewing an agent's permissions here", 'read')
  const [agent, narrowing] = await Promise.all([agentPermissionsRow(args.agentId), getAgentOverride(boundary, args.agentId)])
  const canChange = boundary.type === 'user' || (await projectRole(boundary.id, userId)) === 'ADMIN'
  return { agentId: agent.id, boundary, canChange, ...narrowingView(organisationPermissions(agent), narrowing) }
}

export type CardOpenTask = { id: string; key: string; title: string; state: string; runState: string }

export type AgentCardHereView = {
  /** Where the card was opened: a project, or the person's Chat. */
  place: { kind: 'project'; projectId: string; personal: boolean } | { kind: 'chat' }
  /** How many tools, patterns and approval the place narrows for this agent (its Permissions here, or Your permissions in Chat). */
  narrowedCount: number
  /** The agent's open tasks in the project, most recently changed first; empty in Chat. */
  openTasks: CardOpenTask[]
}

/** `projectId` is the project the card is opened in; without it, the person's Chat. */
export const getAgentCardHere: GetAgentCardHere<{ agentId: string; projectId?: string | null }, AgentCardHereView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const agent = await agentPermissionsRow(args.agentId)
  if (!args.projectId) {
    const narrowing = await getAgentOverride({ type: 'user', id: userId }, agent.id)
    return { place: { kind: 'chat' }, narrowedCount: narrowingView(organisationPermissions(agent), narrowing).narrowedCount, openTasks: [] }
  }
  const projectId = args.projectId
  await requireProjectMember(projectId, userId, "Viewing an agent's card in this project")
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { personalOwnerId: true } })
  const boundary: OverrideBoundary = project.personalOwnerId
    ? { type: 'user', id: project.personalOwnerId }
    : { type: 'project', id: projectId }
  const [narrowing, work] = await Promise.all([
    getAgentOverride(boundary, agent.id),
    readAgentWork({ projectIds: [projectId], agentIds: [agent.id] }),
  ])
  const openTasks = workOf(work, agent.id, projectId).tasks
    .filter(t => t.state !== 'DONE')
    .map(t => ({ id: t.id, key: `${t.projectKey}-${t.number}`, title: t.title, state: t.state, runState: t.runState }))
  return {
    place: { kind: 'project', projectId, personal: project.personalOwnerId !== null },
    narrowedCount: narrowingView(organisationPermissions(agent), narrowing).narrowedCount,
    openTasks,
  }
}
