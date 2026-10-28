/**
 * Agent Actions — CRUD Operations
 * =================================
 *
 * Thin Wasp action wrappers: authenticate, guard, then delegate to agentService.
 * Business logic lives in agentService.ts.
 */
import { type CreateAgent, type UpdateAgent, type DeleteAgent, type StopAgent, type SaveAgentSkill, type DeleteAgentSkill, type UploadAgentImage, type ApplyAgentPreset } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { KERNEL_HANDLE, assertNotReservedHandle, assertNotKernel, assertKernelUpdateAllowed } from './kernelGuards'
import { requireRole } from '../server/identity/requireRole'
import { sitesForAgent } from './agentSite'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { getHqAssetsRoot } from '../server/hqAssets'
import { prisma } from 'wasp/server'
import { createAgent as createAgentRecord, updateAgent as updateAgentRecord, deleteAgent as deleteAgentRecord } from './agentService'
import { resolveRealWriteTargetWithin } from '../server/realPathWithin'
import { getAgentImagesDir, getHqStorageRoot } from '../server/hqStoragePaths'
import { writeImageFromDataUrl } from '../server/imageUpload'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeAgentContent } from '../packages/agentPackageService'
import { replaceSkill, removeSkill } from '../packages/skillFiles'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Agents')

export type CreateAgentArgs = {
  name: string
  handle: string
  role?: string
}

/** Identity. Settings go through updateAgentSettings. */
export type UpdateAgentArgs = { id: string; name?: string; handle?: string; role?: string }

const BEHAVIOUR_FIELDS = ['allowedTools', 'allowedBashPatterns', 'approval'] as const

type DeleteAgentArgs = { id: string }

export const createAgent: CreateAgent<CreateAgentArgs, any> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating an agent')
  try { assertNotReservedHandle(args.handle) } catch {
    throw new HttpError(403, `Handle @${KERNEL_HANDLE} is reserved for the built-in agent`)
  }
  return packageWriteOrHttp(() => createAgentRecord({ ...args, createdById: context.user!.id }))
}

export const updateAgent: UpdateAgent<UpdateAgentArgs, any> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's name, handle or role")
  for (const field of BEHAVIOUR_FIELDS) {
    if ((args as Record<string, unknown>)[field] !== undefined) {
      throw new HttpError(400, `'${field}' is a setting — change it with updateAgentSettings`)
    }
  }
  const agent = await context.entities.Agent.findUnique({ where: { id: args.id } })
  if (!agent) throw new HttpError(404, 'Agent not found')
  try { assertKernelUpdateAllowed(agent, args) } catch (e: any) {
    throw new HttpError(403, e.message)
  }
  if (args.handle) {
    try { assertNotReservedHandle(args.handle) } catch {
      throw new HttpError(403, `Handle @${KERNEL_HANDLE} is reserved for the built-in agent`)
    }
  }
  return updateAgentRecord({ id: args.id, name: args.name, handle: args.handle, role: args.role })
}

/**
 * plan 5d-2 task 9a/9b: agent execution lives on site now.
 * `siteRuntimeStore.stopAgent` is the site-side "stop everything for this
 * agent" call (its own `agent.stop` handler cancels the run AND the
 * container) — called unconditionally, once. The `activeRuns` read (9b
 * re-point) goes through `siteRuntimeStore.listRuns`, then each is cancelled
 * through the site it resolves to, not the in-process engine.
 */
export const stopAgent: StopAgent<{ id: string }, { ok: boolean; cancelledRuns: number }> = async ({ id }, context) => {
  await requireRole(context, 'ADMIN', 'Stopping an agent')
  const agent = await context.entities.Agent.findUnique({ where: { id } })
  if (!agent) throw new HttpError(404, 'Agent not found')

  // Stopping "the agent" has no single location behind it, but its RUNS do —
  // each on the site holding the storage it works in. So every site the agent
  // has a session on is stopped and swept. An agent with no sessions has had
  // no runs and so no containers, and there is nothing to address.
  // `unresolved` is deliberately not surfaced here: a session naming no site
  // has no reachable container or run to stop in the first place, so it
  // changes nothing about what this action managed to do.
  const { siteIds } = await sitesForAgent(id)
  let cancelledRuns = 0
  for (const siteId of siteIds) {
    await siteRuntimeStore.stopAgent(siteId, agent.handle)
    const activeRuns = await siteRuntimeStore.listRuns(siteId, { agentId: id, activeOnly: true })
    for (const run of activeRuns) {
      await siteRuntimeStore.cancelRun(siteId, run.id)
    }
    cancelledRuns += activeRuns.length
  }

  return { ok: true, cancelledRuns }
}

export const deleteAgent: DeleteAgent<DeleteAgentArgs, any> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Deleting an agent')
  const agent = await context.entities.Agent.findUnique({ where: { id: args.id } })
  if (!agent) throw new HttpError(404, 'Agent not found')
  try { assertNotKernel(agent, 'deleted') } catch {
    throw new HttpError(403, 'The built-in agent cannot be deleted')
  }
  try {
    return await deleteAgentRecord(args.id)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

type SaveAgentSkillArgs = { agentId: string; slug: string; content: string }

export const saveAgentSkill: SaveAgentSkill<SaveAgentSkillArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's skills")
  await packageWriteOrHttp(() => changeAgentContent(
    args.agentId,
    d => ({ ...d, skillFiles: replaceSkill(d.skillFiles, args.slug, [{ path: 'SKILL.md', content: Buffer.from(args.content, 'utf-8') }]) }),
    context.user!.id,
  ))
}

type DeleteAgentSkillArgs = { agentId: string; slug: string }

export const deleteAgentSkill: DeleteAgentSkill<DeleteAgentSkillArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's skills")
  await packageWriteOrHttp(() => changeAgentContent(args.agentId, d => ({ ...d, skillFiles: removeSkill(d.skillFiles, args.slug) }), context.user!.id))
}

type UploadAgentImageArgs = {
  agentId: string
  type: 'avatar' | 'cover'
  dataUrl: string // data:<mime>;base64,<data>
}

export const uploadAgentImage: UploadAgentImage<UploadAgentImageArgs, { url: string }> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's image")

  const agent = await context.entities.Agent.findUnique({ where: { id: args.agentId } })
  if (!agent) throw new HttpError(404, 'Agent not found')

  const filename = await writeImageFromDataUrl(getAgentImagesDir(args.agentId), args.dataUrl)

  const url = `/agents/${args.agentId}/images/${filename}`
  const field = args.type === 'avatar' ? 'avatarUrl' : 'coverUrl'
  await context.entities.Agent.update({ where: { id: args.agentId }, data: { [field]: url } })
  return { url }
}

type ApplyAgentPresetArgs = { agentId: string; imageType: 'avatar' | 'cover'; filename: string }
export const applyAgentPreset: ApplyAgentPreset<ApplyAgentPresetArgs, { url: string }> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Applying an agent preset')
  const { agentId, imageType, filename } = args

  // Validate filename — must be a simple name with a known image extension
  if (!/^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(filename) || filename.includes('..')) {
    throw new HttpError(400, 'Invalid preset filename')
  }

  await context.entities.Agent.findUniqueOrThrow({ where: { id: agentId }, select: { id: true } })
  const srcDir = path.join(getHqAssetsRoot(), `${imageType}s`)
  const src = path.join(srcDir, filename)
  const ext = path.extname(filename)

  const uuid = crypto.randomUUID()
  const destFilename = `${uuid}${ext}`
  const target = await resolveRealWriteTargetWithin(getHqStorageRoot(), path.join(getAgentImagesDir(agentId), destFilename))
  if (!target) throw new HttpError(403, 'Path not allowed')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(src, target)

  const url = `/agents/${agentId}/images/${destFilename}`
  const field = imageType === 'avatar' ? 'avatarUrl' : 'coverUrl'
  await context.entities.Agent.update({ where: { id: agentId }, data: { [field]: url } })
  return { url }
}
