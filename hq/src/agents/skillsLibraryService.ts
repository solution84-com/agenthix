/**
 * The Library's skills as its current screens read them (adr-0157): Agenthix's offered skills from hq's image
 * (scope PLATFORM, id `agenthix/<name>`), and the skills the organisation installed or made (scope ORG, id the
 * asset's). Agenthix's skills the organisation installed stay listed under PLATFORM, as the shelf they came from.
 */
import { prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import type { Db } from '../packages/packageStore'
import { readContent } from '../assets/content'
import { skillDescription, skillMdOf, skillTitle } from '../assets/skillFile'
import { validateSkill } from '../assets/validation'
import { listShelf } from '../assets/sources/imageShelf'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Library')

export type LibrarySkillRow = {
  id: string
  slug: string
  name: string
  description: string
  /** SKILL.md's body, for the viewer. */
  content: string
  scope: 'PLATFORM' | 'ORG'
  orgId: string | null
  publisher: string
  version: string
}

export async function listShelfSkills(): Promise<LibrarySkillRow[]> {
  return (await listShelf()).map(s => ({
    id: s.identity, slug: s.name, name: s.title, description: s.description,
    content: skillMdOf(s.files)?.body ?? '', scope: 'PLATFORM', orgId: null, publisher: AGENTHIX_PUBLISHER, version: s.version,
  }))
}

/** Installed and made-here skills in the Library, Agenthix's own aside. */
export async function listOrgSkills(db: Db = prisma): Promise<LibrarySkillRow[]> {
  const [org, assets] = await Promise.all([
    db.org.findFirst({ select: { id: true } }),
    db.asset.findMany({
      where: { kind: 'SKILL', removedAt: null, builtIn: false, currentVersionId: { not: null }, publisher: { not: AGENTHIX_PUBLISHER } },
      include: { currentVersion: { select: { version: true, digest: true } } },
      orderBy: { name: 'asc' },
    }),
  ])
  return Promise.all(assets.map(async a => {
    const files = await readContent(a.currentVersion!.digest, db)
    const md = skillMdOf(files)
    return {
      id: a.id, slug: a.name, name: skillTitle(md, a.name), description: skillDescription(md), content: md?.body ?? '',
      scope: 'ORG' as const, orgId: org?.id ?? null, publisher: a.publisher, version: a.currentVersion!.version,
    }
  }))
}

export async function listLibrarySkills(scope: 'PLATFORM' | 'ORG'): Promise<LibrarySkillRow[]> {
  return scope === 'PLATFORM' ? listShelfSkills() : listOrgSkills()
}

/**
 * Boot: the shelf read once, so a skill in hq's image that fails the Agent Skills rules is logged at start, not met
 * by the first person who installs it. Nothing is written: offered skills are installed only when someone chooses.
 */
export async function seedPlatformSkills(): Promise<void> {
  for (const skill of await listShelf()) {
    const { errors } = validateSkill(skill.name, skill.files)
    if (errors.length) logger.warn(`Agenthix's ${skill.name} on the shelf fails validation: ${errors.join(' ')}`)
  }
}
