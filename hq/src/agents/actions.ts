/**
 * Agent Actions — CRUD Operations
 * =================================
 *
 * Thin Wasp action wrappers: authenticate, guard, then delegate to agentService.
 * Business logic lives in agentService.ts.
 */
import { type CreateAgent, type UpdateAgent, type DeleteAgent, type StopAgent, type SaveAgentSkill, type DeleteAgentSkill, type CreateLibrarySkill, type UpdateLibrarySkill, type DeleteLibrarySkill, type InstallSkill, type UninstallSkill, type UploadAgentImage, type ApplyAgentPreset } from 'wasp/server/operations'
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
import { createLibrarySkill as createLibrarySkillRecord, updateLibrarySkill as updateLibrarySkillRecord, deleteLibrarySkill as deleteLibrarySkillRecord, orgLibrarySkillDir, orgLibrarySkillFile } from './skillsLibraryService'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeAgentContent } from '../packages/agentPackageService'
import { changeOrgPackage } from '../packages/orgPackageService'
import { replaceSkill, removeSkill, removeSkillInstalledFrom, librarySkillFiles } from '../packages/skillFiles'
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

// -- Library skill actions ---------------------------------------------------

type CreateLibrarySkillArgs = {
  scope: 'PLATFORM' | 'ORG'
  orgId?: string
  slug: string
  name: string
  description: string
  content: string  // SKILL.md body — written to disk, assetPath stored in DB
}

export const createLibrarySkill: CreateLibrarySkill<CreateLibrarySkillArgs, any> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating a library skill')
  const { scope, orgId, slug, name, description, content } = args
  // The row first: it validates the slug, and a taken slug fails here rather
  // than after an existing skill's source has been overwritten.
  const skill = await createLibrarySkillRecord({ scope, orgId, slug, name, description, assetPath: `org/skills/${slug}` })
    .catch((e: unknown) => {
      throw new HttpError(400, e instanceof Error ? e.message : 'Failed to create skill')
    })
  const skillDir = orgLibrarySkillDir(slug)
  try {
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
  } catch {
    // The row rollback can itself fail (e.g. the DB going away mid-request). A
    // swallowed failure here would leave an orphaned row with no SKILL.md on
    // disk and the slug still taken, so a failed rollback is logged rather
    // than silently dropped — the original write error is still what the
    // caller sees.
    await prisma.skill.delete({ where: { id: skill.id } }).catch((deleteError: unknown) => {
      logger.error(
        `createLibrarySkill: failed to roll back orphaned skill row after a disk write failure (slug: ${slug}, id: ${skill.id})`,
        deleteError,
      )
    })
    throw new HttpError(500, 'Failed to write skill')
  }
  return skill
}

type UpdateLibrarySkillArgs = { id: string; name?: string; description?: string; content?: string }

export const updateLibrarySkill: UpdateLibrarySkill<UpdateLibrarySkillArgs, any> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating a library skill')
  // Only the fields the editor sends. A stored slug or assetPath decides where
  // later writes, installs and deletes land, so a client never sets either.
  const { id, name, description, content } = args
  try {
    // Write content to disk if provided (ORG skills only — PLATFORM skills are read-only)
    if (content !== undefined) {
      const skill = await prisma.skill.findUnique({ where: { id }, select: { assetPath: true, scope: true } })
      if (skill && skill.scope === 'ORG') {
        let skillFile: string
        try { skillFile = orgLibrarySkillFile(skill.assetPath) } catch { throw new HttpError(403, 'Path not allowed') }
        await fs.mkdir(path.dirname(skillFile), { recursive: true })
        await fs.writeFile(skillFile, content, 'utf-8')
      }
    }
    return await updateLibrarySkillRecord(id, { name, description })
  } catch (e: unknown) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, e instanceof Error ? e.message : 'Failed to update skill')
  }
}

type DeleteLibrarySkillArgs = { id: string }

export const deleteLibrarySkill: DeleteLibrarySkill<DeleteLibrarySkillArgs, void> = async (args, context) => {
  // Deleting a skill the org has installed removes it from the org package (P15).
  await requireRole(context, 'ADMIN', 'Deleting a library skill')
  const skill = await prisma.skill.findUnique({ where: { id: args.id }, select: { slug: true } })
  try {
    await deleteLibrarySkillRecord(args.id)
  } catch (e: unknown) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Failed to delete skill')
  }
  if (skill) await packageWriteOrHttp(() => changeOrgPackage(files => removeSkillInstalledFrom(files, skill.slug, args.id), context.user!.id))
}

type InstallTarget = { scope: 'ORG'; orgId: string } | { scope: 'AGENT'; agentId: string }

type InstallSkillArgs = { skillId: string; target: InstallTarget }

/** Every InstallTarget member is 'ORG' or 'AGENT' — anything else, including a missing target, is a 400, not a TypeError. */
function assertInstallTargetScope(target: InstallTarget | undefined): asserts target is InstallTarget {
  const scope = (target as { scope?: unknown } | undefined)?.scope
  if (scope !== 'ORG' && scope !== 'AGENT') throw new HttpError(400, `Invalid skill target scope '${scope}'`)
}

export const installSkill: InstallSkill<InstallSkillArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Installing a skill')
  assertInstallTargetScope(args.target)
  const skill = await prisma.skill.findUnique({ where: { id: args.skillId } })
  if (!skill) throw new HttpError(404, 'Skill not found')
  if (args.target.scope === 'AGENT') {
    const { agentId } = args.target
    const skillFiles = await librarySkillFiles(skill)
    await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: replaceSkill(d.skillFiles, skill.slug, skillFiles) }), context.user!.id))
    return
  }
  const orgFiles = await librarySkillFiles(skill)
  const written = await packageWriteOrHttp(() => changeOrgPackage(files => replaceSkill(files, skill.slug, orgFiles), context.user!.id))
  if (!written) throw new HttpError(409, 'Create the organisation before installing skills for it')
}

type UninstallSkillArgs = { slug: string; target: InstallTarget }

export const uninstallSkill: UninstallSkill<UninstallSkillArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Removing a skill')
  assertInstallTargetScope(args.target)
  if (args.target.scope === 'AGENT') {
    const { agentId } = args.target
    await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: removeSkill(d.skillFiles, args.slug) }), context.user!.id))
    return
  }
  const written = await packageWriteOrHttp(() => changeOrgPackage(files => removeSkill(files, args.slug), context.user!.id))
  if (!written) throw new HttpError(409, 'There is no organisation to remove a skill from')
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
