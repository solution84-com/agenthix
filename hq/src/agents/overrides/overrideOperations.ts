import type { GetAgentOverride, SetAgentOverride } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireProjectAdmin, requireProjectMember } from '../../projects/membership'
import { refuseOnPersonalProject } from '../../projects/personalProject'
import {
  getAgentOverride as readOverride, setAgentOverride as writeOverride, OverrideValidationError,
  type AgentOverrideValues, type OverrideBoundary,
} from './agentOverrideService'

type BoundaryArgs = { boundaryType: 'project' | 'user'; boundaryId: string; agentId: string }

/**
 * A project's overrides are its admin's to change (spec §6.4) and every
 * member's to read — "In this project" is shown to all of them (every screen
 * reviewed spec §3). A person's are their own alone.
 */
export async function authorizeBoundary(args: BoundaryArgs, userId: string, doing: string, access: 'read' | 'write'): Promise<OverrideBoundary> {
  if (args.boundaryType === 'user') {
    if (args.boundaryId !== userId) throw new HttpError(403, `${doing} is only possible for your own storage`)
    // The project branch below gets this for free from its "assigned to this
    // project" check; a user boundary has no such check, so without this a
    // nonexistent agentId would reach the write and fail on AgentOverride's
    // foreign key — an opaque 500 instead of a clear 404.
    const agent = await prisma.agent.findUnique({ where: { id: args.agentId }, select: { id: true } })
    if (!agent) throw new HttpError(404, 'Agent not found')
    return { type: 'user', id: userId }
  }
  if (args.boundaryType !== 'project') throw new HttpError(400, 'Unknown boundary')
  if (access === 'write') await requireProjectAdmin(args.boundaryId, userId, doing)
  else await requireProjectMember(args.boundaryId, userId, doing)
  // A personal project's runs take its person's own overrides (spec §4), set
  // in their own settings; overrides on the project itself would never apply.
  await refuseOnPersonalProject(args.boundaryId, 'Agent overrides')
  const assigned = await prisma.projectAgent.findUnique({
    where: { projectId_agentId: { projectId: args.boundaryId, agentId: args.agentId } },
  })
  if (!assigned) throw new HttpError(400, 'That agent is not assigned to this project')
  return { type: 'project', id: args.boundaryId }
}

export const getAgentOverride: GetAgentOverride<BoundaryArgs, AgentOverrideValues | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const boundary = await authorizeBoundary(args, context.user.id, "Viewing an agent's overrides", 'read')
  return readOverride(boundary, args.agentId)
}

/**
 * As sent: each field optional — a missing one, like a null one, leaves the organisation's as it is — and
 * validated before it is stored (validateOverride).
 */
type SetArgs = BoundaryArgs & {
  model?: string | null
  approval?: string | null
  allowedTools?: { name: string; state: string }[] | null
  allowedBashPatterns?: { pattern: string; state: string }[] | null
}

export const setAgentOverride: SetAgentOverride<SetArgs, AgentOverrideValues | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const boundary = await authorizeBoundary(args, context.user.id, "Changing an agent's overrides", 'write')
  try {
    const { model, approval, allowedTools, allowedBashPatterns } = args
    return await writeOverride(boundary, args.agentId, { model, approval, allowedTools, allowedBashPatterns }, context.user.id)
  } catch (err) {
    if (err instanceof OverrideValidationError) throw new HttpError(400, err.message)
    throw err
  }
}
