/**
 * The built-in skills installed at boot (spec part 1 L1a, adr-0156): one `agenthix/<name>` asset each, `builtIn`, by
 * identity. Content the image already held is pinned again; changed content is a new version, numbered after the
 * highest held. A built-in the image no longer ships is removed, and one it ships again comes back. An administrator's
 * switch is never touched, so a switched-off built-in stays off across releases.
 */
import { AGENTHIX_PUBLISHER, compareSemVer } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { fingerprintOf, storeContent } from '../content'
import type { PlatformSkill } from './platformSkills'

export const UPDATED_WITH_HQ = 'Updated with HQ'

export type BuiltInInstallResult = { name: string; version: string; outcome: 'new' | 'same' | 'changed' }

/** The next version of a built-in: one major past the highest held, `1.0.0` for the first. */
export function nextBuiltInVersion(held: string[]): string {
  const highest = [...held].sort(compareSemVer).at(-1)
  const major = highest ? Number(highest.split('.')[0]) : 0
  return `${(Number.isSafeInteger(major) ? major : 0) + 1}.0.0`
}

async function installOne(db: Db, skill: PlatformSkill): Promise<BuiltInInstallResult> {
  const where = { kind_publisher_name: { kind: 'SKILL' as const, publisher: AGENTHIX_PUBLISHER, name: skill.name } }
  const asset = await db.asset.upsert({
    where,
    create: { kind: 'SKILL', publisher: AGENTHIX_PUBLISHER, name: skill.name, builtIn: true },
    // Agenthix's identity comes only from hq's image or Agenthix's signature, so a row of that name is this skill.
    update: { builtIn: true, givenToAll: false, removedAt: null, removedById: null, setAsideById: null },
    include: { versions: { select: { id: true, version: true, digest: true } } },
  })
  const digest = fingerprintOf(skill.files)
  const heldVersion = asset.versions.find(v => v.digest === digest)
  if (heldVersion && asset.currentVersionId === heldVersion.id) return { name: skill.name, version: heldVersion.version, outcome: 'same' }

  await storeContent(skill.files, db)
  const target = heldVersion ?? await db.assetVersion.create({
    data: {
      assetId: asset.id, version: nextBuiltInVersion(asset.versions.map(v => v.version)), digest, source: 'BUILT_IN',
      note: UPDATED_WITH_HQ,
    },
    select: { id: true, version: true, digest: true },
  })
  await db.asset.update({ where: { id: asset.id }, data: { currentVersionId: target.id } })
  await db.assetPinChange.create({
    data: { assetId: asset.id, fromVersionId: asset.currentVersionId, toVersionId: target.id, byId: null, reason: UPDATED_WITH_HQ },
  })
  return { name: skill.name, version: target.version, outcome: asset.currentVersionId === null ? 'new' : 'changed' }
}

export async function installBuiltInSkills(db: Db, skills: PlatformSkill[]): Promise<{ installed: BuiltInInstallResult[]; removed: string[] }> {
  const installed: BuiltInInstallResult[] = []
  for (const skill of skills) installed.push(await installOne(db, skill))
  const shipped = skills.map(s => s.name)
  const gone = await db.asset.findMany({
    where: { kind: 'SKILL', builtIn: true, removedAt: null, name: { notIn: shipped } },
    select: { id: true, publisher: true, name: true },
  })
  if (gone.length) await db.asset.updateMany({ where: { id: { in: gone.map(g => g.id) } }, data: { removedAt: new Date(), removedById: null } })
  return { installed, removed: gone.map(g => `${g.publisher}/${g.name}`) }
}
