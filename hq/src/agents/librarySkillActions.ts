/**
 * The Library's skill actions as its current screens call them, over the asset records (adr-0157): make a skill here,
 * publish an edit of one, remove one, and give one to the organisation or to an agent. Every permission is the
 * policy's (`assets/policy.ts`); every install goes through the pipeline (`assets/install/`).
 *
 * Giving a skill still copies it into the organisation's or the agent's package, from its pinned version, so runs
 * receive it as they did before the asset layer; the asset records who has it.
 */
import { HttpError, prisma } from 'wasp/server'
import type { CreateLibrarySkill, UpdateLibrarySkill, DeleteLibrarySkill, InstallSkill, UninstallSkill } from 'wasp/server/operations'
import { AGENTHIX_PUBLISHER, parseAssetIdentity } from '@agenthix/core'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeAgentContent, readAgentContent } from '../packages/agentPackageService'
import { changeOrgPackage } from '../packages/orgPackageService'
import { readCurrentFiles } from '../packages/packageStore'
import { replaceSkill, removeSkill, removeSkillInstalledFrom } from '../packages/skillFiles'
import { parseFrontmatter } from './skillsActiveService'
import { readContent } from '../assets/content'
import { installPackage } from '../assets/install/commit'
import { previewInstall } from '../assets/install/preview'
import { createMadeHereSkill, publishMadeHereEdit, MadeHereError } from '../assets/madeHere'
import { NoOrganisationError } from '../assets/organisationPublisher'
import { skillCopy, type SkillCopy } from '../assets/packageCopies'
import { organisationTarget, requireMay } from '../assets/policyActors'
import type { PersonActor } from '../assets/policy'
import { createVerifier } from '../assets/signing'
import { shelfArrival } from '../assets/sources/imageShelf'
import { asHttp } from '../assets/operations'

const NOTHING = 'Nothing was changed.'

async function madeHere<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof MadeHereError) throw new HttpError(err.status, err.message)
    if (err instanceof NoOrganisationError) throw new HttpError(409, err.message)
    throw err
  }
}

type CreateLibrarySkillArgs = { scope?: 'PLATFORM' | 'ORG'; orgId?: string; slug: string; name: string; description: string; content: string }

export const createLibrarySkill: CreateLibrarySkill<CreateLibrarySkillArgs, { id: string; identity: string }> = async (args, context) => {
  const actor = await requireMay(context, 'publish', await organisationTarget(prisma))
  const { slug, name, description, content } = args
  return madeHere(() => createMadeHereSkill(prisma, { name: slug, title: name ?? '', description: description ?? '', content: content ?? '', byId: actor.userId }))
}

type UpdateLibrarySkillArgs = { id: string; name?: string; description?: string; content?: string }

export const updateLibrarySkill: UpdateLibrarySkill<UpdateLibrarySkillArgs, { id: string; version: string }> = async (args, context) => {
  const actor = await requireMay(context, 'publish', await organisationTarget(prisma))
  return madeHere(() => publishMadeHereEdit(prisma, { assetId: args.id, description: args.description, content: args.content, byId: actor.userId }))
}

export const deleteLibrarySkill: DeleteLibrarySkill<{ id: string }, void> = async (args, context) => {
  const actor = await requireMay(context, 'remove', await organisationTarget(prisma))
  const asset = await prisma.asset.findUnique({ where: { id: String(args.id) } })
  if (!asset || asset.kind !== 'SKILL' || asset.removedAt) throw new HttpError(404, `That skill isn't in the Library. ${NOTHING}`)
  if (asset.builtIn) throw new HttpError(400, `Built-in skills are switched off, not removed. ${NOTHING}`)
  await prisma.asset.update({ where: { id: asset.id }, data: { removedAt: new Date(), removedById: actor.userId } })
  const identity = `${asset.publisher}/${asset.name}`
  await packageWriteOrHttp(() => changeOrgPackage(files => removeSkillInstalledFrom(files, asset.name, identity), actor.userId))
}

/** A Library skill by the id its screens hold: an Agenthix shelf identity, installed from the image if it isn't yet, or an asset's id. */
async function libraryAsset(skillId: string, actor: PersonActor) {
  const shelf = parseAssetIdentity(skillId)
  if (shelf && shelf.publisher === AGENTHIX_PUBLISHER) {
    const find = () => prisma.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher: AGENTHIX_PUBLISHER, name: shelf.name } }, include: { currentVersion: true } })
    const held = await find()
    if (held && !held.removedAt && held.currentVersion) return held
    const deps = { db: prisma, verifier: createVerifier(), now: new Date() }
    const arrival = await asHttp(() => shelfArrival(shelf.name))
    const preview = await asHttp(() => previewInstall(arrival, actor, deps))
    await asHttp(() => installPackage(arrival, { fingerprint: preview.fingerprint }, actor, deps))
    return find()
  }
  return prisma.asset.findUnique({ where: { id: skillId }, include: { currentVersion: true } })
}

async function copyOf(skillId: string, actor: PersonActor): Promise<{ assetId: string; copy: SkillCopy }> {
  const asset = await libraryAsset(String(skillId), actor)
  if (!asset || asset.kind !== 'SKILL' || asset.removedAt || !asset.currentVersion) throw new HttpError(404, `That skill isn't in the Library. ${NOTHING}`)
  return { assetId: asset.id, copy: skillCopy(asset, asset.currentVersion.version, await readContent(asset.currentVersion.digest, prisma)) }
}

type InstallTarget = { scope: 'ORG'; orgId?: string } | { scope: 'AGENT'; agentId: string }

function assertInstallTargetScope(target: InstallTarget | undefined): asserts target is InstallTarget {
  const scope = (target as { scope?: unknown } | undefined)?.scope
  if (scope !== 'ORG' && scope !== 'AGENT') throw new HttpError(400, `Invalid skill target scope '${String(scope)}'`)
}

export const installSkill: InstallSkill<{ skillId: string; target: InstallTarget }, void> = async (args, context) => {
  assertInstallTargetScope(args.target)
  const actor = await requireMay(context, 'grant', await organisationTarget(prisma))
  const { assetId, copy } = await copyOf(args.skillId, actor)
  if (args.target.scope === 'AGENT') {
    const { agentId } = args.target
    await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: replaceSkill(d.skillFiles, copy.slug, copy.files) }), actor.userId))
    await prisma.assetGrant.upsert({ where: { assetId_agentId: { assetId, agentId } }, create: { assetId, agentId, grantedById: actor.userId }, update: {} })
    return
  }
  const written = await packageWriteOrHttp(() => changeOrgPackage(files => replaceSkill(files, copy.slug, copy.files), actor.userId))
  if (!written) throw new HttpError(409, 'Create the organisation before installing skills for it')
  await prisma.asset.update({ where: { id: assetId }, data: { givenToAll: true } })
}

/** The Library asset a package's copy of `slug` came from, by its `installed_from`. */
function copiedFrom(files: Array<{ path: string; content: Buffer }> | null, slug: string) {
  const skillMd = files?.find(f => f.path === `skills/${slug}/SKILL.md`)
  return skillMd ? parseAssetIdentity(parseFrontmatter(skillMd.content.toString('utf-8')).installedFrom) : null
}

export const uninstallSkill: UninstallSkill<{ slug: string; target: InstallTarget }, void> = async (args, context) => {
  assertInstallTargetScope(args.target)
  const actor = await requireMay(context, 'grant', await organisationTarget(prisma))
  if (args.target.scope === 'AGENT') {
    const { agentId } = args.target
    const content = await readAgentContent(agentId)
    const from = copiedFrom(content?.skillFiles ?? null, args.slug)
    await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: removeSkill(d.skillFiles, args.slug) }), actor.userId))
    if (from) {
      const asset = await prisma.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', ...from } }, select: { id: true } })
      if (asset) await prisma.assetGrant.deleteMany({ where: { assetId: asset.id, agentId } })
    }
    return
  }
  const org = await prisma.org.findFirst({ select: { id: true } })
  const from = copiedFrom(org ? await readCurrentFiles('org', org.id) : null, args.slug)
  const written = await packageWriteOrHttp(() => changeOrgPackage(files => removeSkill(files, args.slug), actor.userId))
  if (!written) throw new HttpError(409, 'There is no organisation to remove a skill from')
  if (from) await prisma.asset.updateMany({ where: { kind: 'SKILL', publisher: from.publisher, name: from.name }, data: { givenToAll: false } })
}
