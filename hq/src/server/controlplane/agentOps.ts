/**
 * Agent and project operations — control-plane service layer (hq/site split
 * spec §7.2, plan 5b-2 task 4). See taskOps.ts's header for the shared
 * conventions.
 */
import { HttpError, prisma } from 'wasp/server'
import { CLAUDE_SDK_RUNTIME } from '@agenthix/core'
import { DEFAULT_MODEL } from '../../agents/models'
import { ControlPlaneError, callerUserId, type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { projectsVisibleToRun } from './runProjectScope'
import { freshRecipe, pictureContextFor, saveRecipePicture } from '../../pictures/service'
import { takePictureSave } from '../../pictures/saveLimit'
import { listAgents, createAgent } from '../../agents/agentService'
import { INVALID_AGENT_HANDLE_MESSAGE, isValidAgentHandle } from '../../agents/agentHandle'
import { createProject } from '../../projects/projectService'
import { requireDefaultExecutionSiteId } from '../../sites/localSite'

// ── list_agents ───────────────────────────────────────────────────────────────

export async function listAgentsOp(_ctx: CallerContext, _args: unknown) {
  const agents = await listAgents()
  return {
    agents: agents.map(a => ({
      agentId: a.id, name: a.name, handle: a.handle,
      // Deprecated, kept so an older caller still reads: the resolver decides a model and a runtime, not the agent.
      runtime: CLAUDE_SDK_RUNTIME, defaultModel: DEFAULT_MODEL, isKernel: a.isKernel,
    })),
    source: 'local',
  }
}

// ── create_agent ──────────────────────────────────────────────────────────────

interface CreateAgentArgs {
  name: string
  role: string
  responsibilities: string
  handle?: string
}

// No blanket try/catch-and-wrap here (plan 5b-2 task 5 review, I3): createAgent
// has no domain error type worth translating, so a failure (e.g. a handle
// collision) propagates uncaught rather than forwarding err.message into a
// 400 body — dataApi.ts's generic catch turns it into an opaque 500 instead.
export async function createAgentOp(ctx: CallerContext, args: CreateAgentArgs) {
  await requireRoleFloor(ctx, 'create_agent')
  // The service refuses it too, but with an HttpError that dataApi.ts would turn
  // into an opaque 500; an agent sending a bad handle should learn why.
  if (args.handle !== undefined && !isValidAgentHandle(args.handle)) {
    throw new ControlPlaneError('invalid', INVALID_AGENT_HANDLE_MESSAGE)
  }
  const agent = await createAgent({ name: args.name, role: args.role, responsibilities: args.responsibilities, handle: args.handle, createdById: callerUserId(ctx) })
  return { success: true, agentId: agent.id, handle: agent.handle, message: `Agent '${args.name}' created`, source: 'local' }
}

// ── generate_agent_picture (target agentId is a deliberate argument — it's a
// target, not self-identity; the ADMIN floor is the guard, not identity pinning).
// It names an agent and nothing else: the owner is always { kind: 'agent' }, so no
// argument reaches a person's, a team's or the organisation's picture. ──

interface GenerateAgentPictureArgs {
  agentId: string
  imageType: 'avatar' | 'cover'
  recipe?: unknown
}

export async function generateAgentPictureOp(ctx: CallerContext, args: GenerateAgentPictureArgs) {
  await requireRoleFloor(ctx, 'generate_agent_picture')
  if (args.imageType !== 'avatar' && args.imageType !== 'cover') throw new ControlPlaneError('invalid', 'imageType is avatar or cover')
  if (typeof args.agentId !== 'string' || args.agentId === '') throw new ControlPlaneError('invalid', 'Name the agent')
  const owner = { kind: 'agent', id: args.agentId } as const
  const subject = await pictureContextFor(owner)
  if (!subject) throw new ControlPlaneError('not_found', 'There is no such agent')
  if (!(await takePictureSave(callerUserId(ctx)))) {
    throw new ControlPlaneError('unavailable', 'Too many pictures saved in the last minute; try again in a minute')
  }
  const recipe = args.recipe ?? (await freshRecipe(owner, args.imageType, subject))
  try {
    const saved = await saveRecipePicture(owner, args.imageType, recipe)
    return { success: true, agentId: args.agentId, imageType: args.imageType, url: saved.url, recipe: saved.recipe }
  } catch (err) {
    // The service's refusals are HttpErrors, which dataApi.ts would answer as an opaque 500; an agent should learn why.
    if (err instanceof HttpError && err.statusCode === 400) {
      throw new ControlPlaneError('invalid', 'That recipe cannot be made: its style, parts or colours are not ones this agent may use')
    }
    if (err instanceof HttpError && err.statusCode === 404) throw new ControlPlaneError('not_found', 'There is no such agent')
    throw err
  }
}

// ── list_projects ─────────────────────────────────────────────────────────────

export async function listProjectsOp(ctx: CallerContext, _args: unknown) {
  // Narrowed like the browser's `getProjects`: what the run's person is
  // entitled to, and of that only what the run's boundary reaches.
  const projects = await prisma.project.findMany({
    where: await projectsVisibleToRun(ctx, 'list_projects'),
    orderBy: { createdAt: 'desc' },
  })
  return {
    projects: projects.map(p => ({
      projectId: p.id, key: p.key, name: p.name,
      description: p.description, defaultAgentId: p.defaultAgentId,
    })),
    source: 'local',
  }
}

// ── create_project ────────────────────────────────────────────────────────────

interface CreateProjectArgs {
  name: string
  description?: string
  defaultAgentId?: string
}

export async function createProjectOp(ctx: CallerContext, args: CreateProjectArgs) {
  await requireRoleFloor(ctx, 'create_project')
  // A project's workspace is real bytes on one machine's disk, so it must
  // name a site. An agent has no picker to offer, so it gets the default one —
  // the same fallback the workforce-template callers use — and with no site
  // connected the call fails before anything is written.
  // Taking the site from the run's capability, which already carries it, is
  // one option — which site a run should land on when it has no project site
  // or agent home site to go by is not yet decided.
  const executionSiteId = await requireDefaultExecutionSiteId()
  const project = await createProject({
    name: args.name, description: args.description, defaultAgentId: args.defaultAgentId,
    executionSiteId,
    createdByUserId: callerUserId(ctx),
  })
  return { success: true, projectId: project.id, message: `Project '${args.name}' created`, source: 'local' }
}
