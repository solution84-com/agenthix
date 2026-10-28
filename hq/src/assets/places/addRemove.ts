/**
 * *Add to this place* and *Remove* (spec part 4 F3, *Defaults and switches*). Adding copies a Library skill, at the
 * version the organisation has pinned, into the place's folder or one agent's, with its identity and version in
 * `metadata` so hq can show where it came from and offer a newer one; it is recorded as the skill's first version
 * there. Adding switches nothing on: under *Off by default* it stays off until switched on. Removing deletes a place
 * skill's folder and keeps its history; a repository's skill can only be switched off, since its repository decides
 * what it holds.
 */
import type { PrismaClient } from '@prisma/client'
import { agentSkillsRoot, ASSET_MANIFEST_FILE, formatAssetIdentity, PLACE_SKILLS_ROOT } from '@agenthix/core'
import { readContent } from '../content'
import type { Actor } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import { byOf } from '../lifecycle/records'
import { assertNotWorkspace, assertPlace, folderOf, placeOfProject, placeOfSkill } from './place'
import { publishFiles } from './placeVersions'
import { removeSkillFolder } from './siteSkills'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

export type AddInput = { projectId: unknown; assetId: unknown; agentId?: unknown }

export async function addToPlace(db: PrismaClient, actor: Actor, input: AddInput): Promise<{ placeSkillId: string; path: string; number: number }> {
  const ctx = await placeOfProject(db, input.projectId)
  assertPlace(actor, 'install', ctx)
  const by = byOf(actor)
  const asset = typeof input.assetId === 'string'
    ? await db.asset.findUnique({ where: { id: input.assetId }, include: { currentVersion: true } })
    : null
  if (!asset || asset.removedAt || asset.kind !== 'SKILL' || !asset.currentVersion) {
    throw new LifecycleError(`That skill isn't in the Library. ${NOTHING}`, 404)
  }
  const agentId = typeof input.agentId === 'string' && input.agentId !== '' ? input.agentId : null
  const root = agentId ? agentSkillsRoot(agentId) : PLACE_SKILLS_ROOT
  if (!root || (agentId && !(await db.agent.findUnique({ where: { id: agentId }, select: { id: true } })))) {
    throw new LifecycleError(`That agent isn't here. ${NOTHING}`, 404)
  }
  const path = `${root}/${asset.name}`
  const taken = await db.placeSkill.findUnique({ where: { placeType_placeId_path: { ...ctx.place, path } } })
  if (taken && !taken.goneAt) throw new LifecycleError(`This place already has a skill named ${asset.name} there. ${NOTHING}`, 409)
  const identity = formatAssetIdentity(asset)
  const version = asset.currentVersion.version
  const files = (await readContent(asset.currentVersion.digest, db)).filter(f => f.path !== ASSET_MANIFEST_FILE)
  return db.$transaction(async tx => {
    const skill = taken ?? await tx.placeSkill.create({ data: { ...ctx.place, path, group: agentId ? 'AGENT' : 'PLACE', agentId } })
    const published = await publishFiles(
      tx, ctx, skill, files, { publishedById: by.byId, requestedByAgentId: null }, `Added from ${identity} ${version}`, { identity, version },
    )
    return { placeSkillId: skill.id, path, number: published.number }
  }, TRANSACTION)
}

export async function removeFromPlace(db: PrismaClient, actor: Actor, input: { placeSkillId: unknown }): Promise<{ removed: true }> {
  const { ctx, skill } = await placeOfSkill(db, input.placeSkillId)
  assertPlace(actor, 'remove', ctx)
  assertNotWorkspace(skill, 'Removing')
  if (skill.goneAt) throw new LifecycleError(`That skill's folder is already gone from the place's files. ${NOTHING}`, 409)
  const { loc, dir } = folderOf(ctx, skill)
  await db.$transaction(async tx => {
    await tx.placeSkill.update({
      where: { id: skill.id },
      data: { goneAt: new Date(), switch: null, switchFingerprint: null, switchedById: byOf(actor).byId, switchedAt: new Date() },
    })
    await removeSkillFolder(loc, dir)
  }, TRANSACTION)
  return { removed: true }
}
