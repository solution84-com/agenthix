/**
 * An agent's skill actions as its page calls them, over the asset records (adr-0157): give a Library skill to one
 * agent, and take it away. Every permission is the policy's (`assets/policy.ts`); every install goes through the
 * pipeline (`assets/install/`). Making, editing and removing a skill, and giving one to every agent, are the Library's
 * own screens over the asset lifecycle (`assets/lifecycle/`): drafts, publishing the revision seen, and asking first.
 *
 * Giving a skill to an agent still copies it into the agent's package, from its pinned version, so runs receive it as
 * they did before the asset layer; the asset records who has it.
 */
import { HttpError, prisma } from 'wasp/server'
import type { InstallSkill, UninstallSkill } from 'wasp/server/operations'
import { AGENTHIX_PUBLISHER, parseAssetIdentity } from '@agenthix/core'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeAgentContent, readAgentContent } from '../packages/agentPackageService'
import { replaceSkill, removeSkill } from '../packages/skillFiles'
import { parseFrontmatter } from './skillsActiveService'
import { readContent } from '../assets/content'
import { installPackage } from '../assets/install/commit'
import { previewInstall } from '../assets/install/preview'
import { skillCopy, type SkillCopy } from '../assets/packageCopies'
import { organisationTarget, requireMay } from '../assets/policyActors'
import type { PersonActor } from '../assets/policy'
import { createVerifier } from '../assets/signing'
import { shelfArrival } from '../assets/sources/imageShelf'
import { asHttp } from '../assets/operations'

const NOTHING = 'Nothing was changed.'

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

type InstallTarget = { scope: 'AGENT'; agentId: string }

const EVERY_AGENT = "Giving a skill to every agent is done from the skill's page in the Library."

function assertInstallTargetScope(target: { scope?: unknown } | undefined): asserts target is InstallTarget {
  const scope = target?.scope
  if (scope === 'ORG') throw new HttpError(400, `${EVERY_AGENT} ${NOTHING}`)
  if (scope !== 'AGENT') throw new HttpError(400, `Invalid skill target scope '${String(scope)}'`)
}

export const installSkill: InstallSkill<{ skillId: string; target: InstallTarget }, void> = async (args, context) => {
  assertInstallTargetScope(args.target)
  const actor = await requireMay(context, 'grant', await organisationTarget(prisma))
  const { assetId, copy } = await copyOf(args.skillId, actor)
  const { agentId } = args.target
  await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: replaceSkill(d.skillFiles, copy.slug, copy.files) }), actor.userId))
  await prisma.assetGrant.upsert({ where: { assetId_agentId: { assetId, agentId } }, create: { assetId, agentId, grantedById: actor.userId }, update: {} })
}

/** The Library asset a package's copy of `slug` came from, by its `installed_from`. */
function copiedFrom(files: Array<{ path: string; content: Buffer }> | null, slug: string) {
  const skillMd = files?.find(f => f.path === `skills/${slug}/SKILL.md`)
  return skillMd ? parseAssetIdentity(parseFrontmatter(skillMd.content.toString('utf-8')).installedFrom) : null
}

export const uninstallSkill: UninstallSkill<{ slug: string; target: InstallTarget }, void> = async (args, context) => {
  assertInstallTargetScope(args.target)
  const actor = await requireMay(context, 'grant', await organisationTarget(prisma))
  const { agentId } = args.target
  const content = await readAgentContent(agentId)
  const from = copiedFrom(content?.skillFiles ?? null, args.slug)
  await packageWriteOrHttp(() => changeAgentContent(agentId, d => ({ ...d, skillFiles: removeSkill(d.skillFiles, args.slug) }), actor.userId))
  if (from) {
    const asset = await prisma.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', ...from } }, select: { id: true } })
    if (asset) await prisma.assetGrant.deleteMany({ where: { assetId: asset.id, agentId } })
  }
}
