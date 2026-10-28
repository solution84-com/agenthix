/**
 * What a used skill was, for the person looking (spec part 5 *Seeing it used*; security review M6): found in hq's own
 * records from the run's entry, and only after the viewer's access is checked now, at view time. An installed skill
 * is for anyone in the organisation; a skill in a place's files for whoever sees that place; a person's own skill for
 * that person alone. Null when the viewer may not see it or hq can't tell what it was: the two are not told apart.
 */
import { parseAssetIdentity, type RunSkillUse } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { personActor } from '../policyActors'
import { readSkillMd, skillTitle, SKILL_FILE } from '../skillFile'

export type UsedSkillLevel = 'built-in' | 'installed' | 'place' | 'yours'

export type UsedSkillOrigin = {
  level: UsedSkillLevel
  /** The person-facing name. */
  title: string
  /** Where it came from, in a few words: Built in, the organisation's name, the project's name, or Yours. */
  where: string
  /** The installed version ("1.3"), or the place's version number ("Version 3"); null when hq doesn't hold it. */
  version: string | null
  identity: string | null
  path: string | null
  fingerprint: string
  /** The content hq holds for exactly what the run used; null: this version isn't kept. */
  digest: string | null
  /** Whether something newer has been published since, in words. */
  newer: string | null
  /** For an installed skill: who it was installed as signed by, or `unsigned`. */
  publisher: string | null
}

export type UsedSkillDeps = {
  db: Db
  /** Whether the person may read the project: any member, Viewers included, or the owner of their own. */
  sees: (projectId: string, userId: string) => Promise<boolean>
}

const INSTALLED = new Set(['platform', 'org', 'agent'])
const IN_FILES = new Set(['boundary', 'shared', 'workspace'])
const TITLE_MAX_BYTES = 256 * 1024

const lastPart = (s: string) => s.slice(s.lastIndexOf('/') + 1)

/** The staged name without its source: what a step showed before hq knew better. */
export function plainSkillName(stagedName: string): string {
  return stagedName.replace(/^(platform|org|agent|boundary|shared|person)-|^workspace-\d+-/, '') || stagedName
}

async function titleOf(db: Db, digest: string, fallback: string): Promise<string> {
  const file = await db.packageFile.findFirst({ where: { contentDigest: digest, path: SKILL_FILE }, select: { bytes: true } })
  if (!file || file.bytes.length > TITLE_MAX_BYTES) return fallback
  return skillTitle(readSkillMd(Buffer.from(file.bytes).toString('utf-8')), fallback)
}

async function orgName(db: Db): Promise<string> {
  return (await db.org.findFirst({ select: { name: true } }))?.name ?? 'Your organisation'
}

async function installed(deps: UsedSkillDeps, viewerId: string, use: RunSkillUse): Promise<UsedSkillOrigin | null> {
  const { db } = deps
  if ((await personActor(viewerId, db)).role === null) return null
  const identity = parseAssetIdentity(use.identity)
  const v = await db.assetVersion.findFirst({
    where: { digest: use.fingerprint, asset: { kind: 'SKILL', ...(identity ? { publisher: identity.publisher, name: identity.name } : {}) } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, version: true, digest: true,
      asset: { select: { publisher: true, name: true, builtIn: true, currentVersion: { select: { id: true, version: true } } } },
    },
  })
  const fallback = identity ? lastPart(identity.name) : plainSkillName(use.name)
  if (!v) {
    return {
      level: use.source === 'platform' ? 'built-in' : 'installed', title: fallback,
      where: use.source === 'platform' ? 'Built in' : await orgName(db), version: use.version ?? null,
      identity: use.identity ?? null, path: null, fingerprint: use.fingerprint, digest: null, newer: null, publisher: null,
    }
  }
  const current = v.asset.currentVersion
  return {
    level: v.asset.builtIn ? 'built-in' : 'installed',
    title: await titleOf(db, v.digest, lastPart(v.asset.name)),
    where: v.asset.builtIn ? 'Built in' : await orgName(db),
    version: v.version,
    identity: `${v.asset.publisher}/${v.asset.name}`,
    path: null,
    fingerprint: use.fingerprint,
    digest: v.digest,
    newer: current && current.id !== v.id ? `The agents that have it now get ${current.version}.` : null,
    publisher: v.asset.publisher,
  }
}

async function inFiles(deps: UsedSkillDeps, viewerId: string, use: RunSkillUse): Promise<UsedSkillOrigin | null> {
  const { db } = deps
  if (!use.placeId || !use.path) return null
  const skill = await db.placeSkill.findFirst({ where: { placeId: use.placeId, path: use.path }, select: { id: true, placeType: true, placeId: true } })
  if (!skill) return null
  const project = skill.placeType === 'project'
    ? await db.project.findUnique({ where: { id: skill.placeId }, select: { id: true, name: true } })
    : await db.project.findFirst({ where: { personalOwnerId: skill.placeId, personalSpace: true }, select: { id: true, name: true } })
  if (!project || !(await deps.sees(project.id, viewerId))) return null
  const [used, newest] = await Promise.all([
    db.placeSkillVersion.findFirst({ where: { placeSkillId: skill.id, digest: use.fingerprint }, orderBy: { number: 'desc' }, select: { number: true, digest: true } }),
    db.placeSkillVersion.findFirst({ where: { placeSkillId: skill.id }, orderBy: { number: 'desc' }, select: { number: true } }),
  ])
  return {
    level: skill.placeType === 'user' ? 'yours' : 'place',
    title: used ? await titleOf(db, used.digest, lastPart(use.path)) : lastPart(use.path),
    where: skill.placeType === 'user' ? 'Yours' : project.name,
    version: used ? `Version ${used.number}` : null,
    identity: null,
    path: use.path,
    fingerprint: use.fingerprint,
    digest: used?.digest ?? null,
    newer: used && newest && newest.number > used.number ? `Version ${newest.number} has been published since.` : null,
    publisher: null,
  }
}

async function persons(deps: UsedSkillDeps, viewerId: string, use: RunSkillUse): Promise<UsedSkillOrigin | null> {
  if (!use.personId || use.personId !== viewerId) return null
  const used = await deps.db.placeSkillVersion.findFirst({
    where: { digest: use.fingerprint, placeSkill: { placeType: 'user', placeId: viewerId } },
    orderBy: { number: 'desc' },
    select: { number: true, digest: true, placeSkill: { select: { path: true } } },
  })
  const fallback = use.identity ? lastPart(use.identity) : plainSkillName(use.name)
  return {
    level: 'yours',
    title: used ? await titleOf(deps.db, used.digest, lastPart(used.placeSkill.path)) : fallback,
    where: 'Yours',
    version: used ? `Version ${used.number}` : null,
    identity: use.identity ?? null,
    path: used?.placeSkill.path ?? null,
    fingerprint: use.fingerprint,
    digest: used?.digest ?? null,
    newer: null,
    publisher: null,
  }
}

export async function usedSkillOrigin(deps: UsedSkillDeps, viewerId: string, use: RunSkillUse): Promise<UsedSkillOrigin | null> {
  if (INSTALLED.has(use.source)) return installed(deps, viewerId, use)
  if (IN_FILES.has(use.source)) return inFiles(deps, viewerId, use)
  if (use.source === 'person') return persons(deps, viewerId, use)
  return null
}

/** The step's words once hq knows what it was: "Used the skill Review code · Fernhill · 1.3". */
export function usedSkillLabel(origin: Pick<UsedSkillOrigin, 'title' | 'where' | 'version'>): string {
  return ['Used the skill ' + origin.title, origin.where, origin.version].filter(Boolean).join(' · ')
}
