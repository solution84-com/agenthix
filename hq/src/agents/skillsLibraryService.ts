/**
 * Skills Library Service
 * ======================
 * DB operations for the skills library — the browsable pool of skills.
 *
 * Library skills are never injected directly at runtime. Only their installed
 * (active filesystem) copies are — see skillsActiveService.ts.
 *
 * Scopes:
 *   PLATFORM — seeded from assets/skills/ at startup; available to anyone
 *   ORG      — org-owned skills (orgId required)
 *   PROJECT  — project-owned skills (orgId + projectId required)
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from 'wasp/server'
import { getHqStorageRoot, getLibrarySkillDir } from '../server/hqStoragePaths'
import { getHqAssetsRoot, resolveHqAssetPath } from '../server/hqAssets'
import { parseFrontmatter } from './skillsActiveService'

// -- Types -------------------------------------------------------------------

export interface CreateSkillData {
  slug: string
  name: string
  description: string
  assetPath: string
  scope: 'PLATFORM' | 'ORG'
  orgId?: string | null
}

export interface UpdateSkillData {
  name?: string
  description?: string
  assetPath?: string
}

// -- Slug validation ---------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error(`Invalid slug: "${slug}"`)
}

/** Where an org library skill's source lives: <HQ_STORAGE_ROOT>/org/skills/<slug>. */
export function orgLibrarySkillDir(slug: string): string {
  assertSlug(slug)
  return getLibrarySkillDir(slug)
}

/**
 * An org library skill's SKILL.md, from its stored assetPath. Refused unless it
 * sits inside org/skills — a stored path is still only as good as whatever
 * wrote it.
 */
export function orgLibrarySkillFile(assetPath: string): string {
  const orgSkillsRoot = path.join(getHqStorageRoot(), 'org', 'skills')
  const dir = path.resolve(getHqStorageRoot(), assetPath)
  if (!dir.startsWith(orgSkillsRoot + path.sep)) throw new Error('Path not allowed')
  return path.join(dir, 'SKILL.md')
}

// -- CRUD --------------------------------------------------------------------

export async function listLibrarySkills(
  scope: 'PLATFORM' | 'ORG',
  orgId?: string | null,
) {
  const skills = await prisma.skill.findMany({
    where: { scope, orgId: orgId ?? null },
    orderBy: { name: 'asc' },
  })
  // Read content from disk for each skill so the viewer can display it
  return Promise.all(skills.map(async (skill) => {
    const sourceDir = scope === 'PLATFORM' ? resolveHqAssetPath(skill.assetPath) : path.join(getHqStorageRoot(), skill.assetPath)
    const skillFile = path.join(sourceDir, 'SKILL.md')
    let content = ''
    try {
      const raw = await fs.readFile(skillFile, 'utf-8')
      // Strip YAML frontmatter — only the body goes to the viewer
      const bodyMatch = raw.match(/^---[\s\S]*?---\r?\n?([\s\S]*)/)
      content = bodyMatch ? bodyMatch[1].trimStart() : raw
    } catch { /* file missing — show empty */ }
    return { ...skill, content }
  }))
}

export async function createLibrarySkill(data: CreateSkillData) {
  assertSlug(data.slug)
  return prisma.skill.create({ data })
}

export async function updateLibrarySkill(id: string, data: UpdateSkillData) {
  return prisma.skill.update({ where: { id }, data })
}

export async function deleteLibrarySkill(id: string): Promise<void> {
  const skill = await prisma.skill.findUnique({ where: { id } })
  await prisma.skill.delete({ where: { id } })
  if (skill) {
    // An org skill's source (createLibrarySkill writes org/skills/<slug>). The
    // directory is derived from the skill's own slug rather than its stored
    // assetPath, so the org/skills containment rule lives in one place
    // (orgLibrarySkillDir) instead of being re-checked here. A platform
    // skill's source is a bundled asset that must never be deleted.
    if (skill.scope === 'ORG') {
      const sourceDir = orgLibrarySkillDir(skill.slug)
      await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

// -- Startup seeding ---------------------------------------------------------

/**
 * Seed platform library skills from assets/library/skills/ into the DB.
 * Runs on every startup — creates missing records, updates existing ones.
 * Skips the `active/` subdirectory.
 */
export async function seedPlatformSkills(): Promise<void> {
  const skillsDir = path.join(getHqAssetsRoot(), 'library', 'skills')
  let entries: string[]
  try {
    entries = await fs.readdir(skillsDir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry === 'active') continue

    const skillDir = path.join(skillsDir, entry)
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    let rawContent: string
    try {
      rawContent = await fs.readFile(skillMdPath, 'utf-8')
    } catch {
      continue
    }

    const { name, description, version } = parseFrontmatter(rawContent)
    const slug = entry
    const assetPath = `library/skills/${slug}`

    // findFirst + upsert pattern to avoid Prisma null unique constraint issues
    const existing = await prisma.skill.findFirst({
      where: { slug, scope: 'PLATFORM', orgId: null },
    })

    if (existing) {
      // Only update when the asset version is higher — keeps updatedAt as a true change signal
      if (version > existing.version) {
        await prisma.skill.update({
          where: { id: existing.id },
          data: { name, description, assetPath, version },
        })
      }
    } else {
      await prisma.skill.create({
        data: { slug, name, description, assetPath, version, scope: 'PLATFORM', orgId: null },
      })
    }
  }
}

