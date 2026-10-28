/**
 * Kernel's own skills (spec part 1 *What Agenthix ships, sorted*): `assembly`, `orchestrate` and `planning`, kept in
 * Kernel's template in hq's image and never offered. Kernel is not a Library template, so no first use installs them;
 * boot does, the way a template's carried skills reach the agent made from it (D14): each installed as Kernel's role
 * skill, `agenthix/kernel/<folder>`, trusted by where it is (adr-0117), and granted to Kernel.
 *
 * **Given once.** A skill is granted only when boot installs it for the first time, so the asset itself records that it
 * was given: an administrator who took one from Kernel, or removed it from the Library, finds it as they left it. A
 * newer one in a new image is stored and offered as an update, never pinned by itself (V2). The build numbers the
 * versions as it does a built-in's: content already held keeps its version, new content takes the next major.
 */
import path from 'node:path'
import { AGENTHIX_PUBLISHER, roleSkillName } from '@agenthix/core'
import type { PrismaClient } from '@prisma/client'
import { getHqAssetsRoot } from '../../server/hqAssets'
import type { PackageFile } from '../../library/packages/packageZip'
import { nextBuiltInVersion } from '../builtins/install'
import { readPlatformSkills } from '../builtins/platformSkills'
import { fingerprintOf } from '../content'
import { writeCarried } from '../install/commit'
import { findExisting } from '../install/lookup'
import type { PackagePart, PackageParts } from '../install/parts'
import { classify, type PlanItem } from '../install/plan'
import { skillDescription, skillMdOf, skillTitle } from '../skillFile'

const KERNEL = 'kernel'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }
export const KERNEL_SKILLS_REASON = 'Installed from Agenthix, for Kernel'

export function kernelSkillsDir(): string {
  return path.join(getHqAssetsRoot(), 'library', 'agents', KERNEL, 'skills')
}

export type KernelSkillOutcome = { identity: string; outcome: PlanItem['outcome']; version: string; problem: string | null }

function partOf(name: string, version: string, files: PackageFile[]): PackagePart {
  const md = skillMdOf(files)
  return {
    kind: 'skill', name, version, claim: AGENTHIX_PUBLISHER, title: skillTitle(md, name), description: skillDescription(md),
    basedOn: [], licence: null, suitedTo: [], files, plain: false, role: true,
  }
}

/**
 * Installs Kernel's skills from hq's image and grants the newly installed ones to Kernel, in one transaction. A folder
 * that fails the Agent Skills rules is reported and left out; a missing folder throws, since that image is broken.
 */
export async function ensureKernelSkills(db: PrismaClient, kernelId: string, dir: string = kernelSkillsDir()): Promise<KernelSkillOutcome[]> {
  const { skills, problems } = await readPlatformSkills(dir)
  const out: KernelSkillOutcome[] = problems.map(problem => ({ identity: `${AGENTHIX_PUBLISHER}/${KERNEL}`, outcome: 'refused', version: '', problem }))
  await db.$transaction(async tx => {
    const items: PlanItem[] = []
    const embedded: PackagePart[] = []
    for (const skill of skills) {
      const name = roleSkillName(KERNEL, skill.name)
      if (!name) continue
      const existing = await findExisting(tx, 'skill', AGENTHIX_PUBLISHER, name)
      const digest = fingerprintOf(skill.files)
      const version = existing?.versions.find(v => v.digest === digest)?.version
        ?? (existing ? nextBuiltInVersion(existing.versions.map(v => v.version)) : '1.0.0')
      const part = partOf(name, version, skill.files)
      const item = classify(existing, { kind: 'skill', name, title: part.title, version, fingerprint: digest }, AGENTHIX_PUBLISHER, null)
      items.push(item)
      embedded.push(part)
      out.push({ identity: item.identity, outcome: item.outcome, version, problem: item.reason })
    }
    const parts: PackageParts = { ...partOf(KERNEL, '1.0.0', []), kind: 'agent', role: false, embedded }
    await writeCarried(tx, items, parts, {
      source: 'BUILT_IN', sourceUrl: null, signerKind: 'NONE', signerIdentity: null, trustedPublisherId: null, byId: null, note: null,
    }, KERNEL_SKILLS_REASON, ['new', 'update'])
    const fresh = items.filter(i => i.outcome === 'new').map(i => i.name)
    if (fresh.length === 0) return
    const assets = await tx.asset.findMany({ where: { kind: 'SKILL', publisher: AGENTHIX_PUBLISHER, name: { in: fresh } }, select: { id: true } })
    await tx.assetGrant.createMany({ data: assets.map(a => ({ assetId: a.id, agentId: kernelId, grantedById: null })), skipDuplicates: true })
  }, TRANSACTION)
  return out
}
