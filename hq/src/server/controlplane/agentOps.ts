/**
 * Agent and project operations — control-plane service layer (hq/site split
 * spec §7.2, plan 5b-2 task 4). See taskOps.ts's header for the shared
 * conventions.
 */
import { prisma } from 'wasp/server'
import { CLAUDE_SDK_RUNTIME } from '@agenthix/core'
import { DEFAULT_MODEL } from '../../agents/models'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import nodePath from 'node:path'
import { ControlPlaneError, callerUserId, type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { projectsVisibleToRun } from './runProjectScope'
import { resolveRealWriteTargetWithin } from '../realPathWithin'
import { getAgentImagesDir, getHqStorageRoot } from '../hqStoragePaths'
import { presetsDir } from '../presetHandlers'
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

// ── list_presets (filesystem only — no caller-scoped data) ──────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export async function listPresetsOp(_ctx: CallerContext, args: { type: 'avatars' | 'covers' }) {
  try {
    const dir = presetsDir(args.type)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = entries
      .filter(e => e.isFile() && IMAGE_EXTS.has(nodePath.extname(e.name).toLowerCase()))
      .map(e => e.name)
      .sort()
    return { type: args.type, files }
  } catch {
    return { type: args.type, files: [] }
  }
}

// ── apply_agent_preset (target agentId is a deliberate argument — it's a
// target, not self-identity; the ADMIN floor is the guard, not identity pinning) ──

interface ApplyAgentPresetArgs {
  agentId: string
  imageType: 'avatar' | 'cover'
  filename: string
}

// No blanket try/catch-and-wrap for the rest (plan 5b-2 task 5 review, I3):
// once the filename is validated above, the remaining failures (agent not
// found, a missing preset file, the DB update) have no domain error type
// worth translating — they propagate uncaught rather than forwarding
// err.message into a 400 body; dataApi.ts's generic catch turns any of them
// into an opaque 500 instead.
export async function applyAgentPresetOp(ctx: CallerContext, args: ApplyAgentPresetArgs) {
  await requireRoleFloor(ctx, 'apply_agent_preset')
  if (!/^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(args.filename) || args.filename.includes('..')) {
    throw new ControlPlaneError('invalid', 'Invalid preset filename')
  }
  // The agent must exist — the row is the guard, not a source of the path,
  // which is keyed by the id the caller named.
  await prisma.agent.findUniqueOrThrow({ where: { id: args.agentId }, select: { id: true } })
  const src = nodePath.join(presetsDir(`${args.imageType}s` as 'avatars' | 'covers'), args.filename)
  const ext = nodePath.extname(args.filename)
  const destFilename = `${randomUUID()}${ext}`
  const target = await resolveRealWriteTargetWithin(getHqStorageRoot(), nodePath.join(getAgentImagesDir(args.agentId), destFilename))
  if (!target) throw new ControlPlaneError('forbidden', 'Path not allowed')
  await fs.mkdir(nodePath.dirname(target), { recursive: true })
  await fs.copyFile(src, target)
  const url = `/agents/${args.agentId}/images/${destFilename}`
  const field = args.imageType === 'avatar' ? 'avatarUrl' : 'coverUrl'
  await prisma.agent.update({ where: { id: args.agentId }, data: { [field]: url } })
  return { success: true, agentId: args.agentId, imageType: args.imageType, url }
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
