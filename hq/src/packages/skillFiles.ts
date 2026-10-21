/**
 * Skills as package files: `skills/<slug>/SKILL.md` plus companions. A skill in
 * an agent or org package is copied in at install time, so a later change to
 * the library skill does not reach it until it is installed again (spec §6.2).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidPackagePath } from '@agenthix/core'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { resolveHqAssetPath } from '../server/hqAssets'
import { parseFrontmatter, type SkillEntry, type InstallableSkill } from '../agents/skillsActiveService'
import { PackageContentError, assertSkillSlug, type PackageFileInput } from './packageStore'

export const SKILLS_DIR = 'skills'

export { assertSkillSlug }

/** Every regular file under `root/<skill>/…`, as `<prefix>/<skill>/…`. Links and hidden names are skipped. */
export async function readSkillTree(root: string, prefix: string, only?: ReadonlySet<string>): Promise<PackageFileInput[]> {
  const out: PackageFileInput[] = []
  async function walk(dir: string, rel: string[]): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (rel.length === 0 && (!entry.isDirectory() || (only && !only.has(entry.name)))) continue
      const nextRel = [...rel, entry.name]
      const packagePath = [prefix, ...nextRel].join('/')
      if (!isValidPackagePath(packagePath)) continue
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), nextRel)
      else if (entry.isFile()) out.push({ path: packagePath, content: await fs.readFile(path.join(dir, entry.name)) })
    }
  }
  await walk(root, [])
  return out
}

/** `skillFiles` paths are relative to the skill's own directory. */
export function replaceSkill(files: PackageFileInput[], slug: string, skillFiles: PackageFileInput[]): PackageFileInput[] {
  assertSkillSlug(slug)
  if (!skillFiles.some(f => f.path === 'SKILL.md')) throw new PackageContentError(`Skill ${slug} has no SKILL.md`)
  const prefix = `${SKILLS_DIR}/${slug}/`
  return [
    ...files.filter(f => !f.path.startsWith(prefix)),
    ...skillFiles.map(f => ({ path: prefix + f.path, content: f.content })),
  ]
}

export function removeSkill(files: PackageFileInput[], slug: string): PackageFileInput[] {
  assertSkillSlug(slug)
  const prefix = `${SKILLS_DIR}/${slug}/`
  return files.filter(f => !f.path.startsWith(prefix))
}

/**
 * Removes an installed skill only when it came from `librarySkillId` — its
 * SKILL.md carries `installed_from` (librarySkillFiles). A PLATFORM and an ORG
 * library skill can share a slug; deleting one must not remove the other's copy.
 */
export function removeSkillInstalledFrom(files: PackageFileInput[], slug: string, librarySkillId: string): PackageFileInput[] {
  assertSkillSlug(slug)
  const skillMd = files.find(f => f.path === `${SKILLS_DIR}/${slug}/SKILL.md`)
  if (!skillMd || parseFrontmatter(skillMd.content.toString('utf-8')).installedFrom !== librarySkillId) return files
  return removeSkill(files, slug)
}

export function skillEntries(files: PackageFileInput[]): SkillEntry[] {
  const entries: SkillEntry[] = []
  for (const file of files) {
    const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.path)
    if (!match) continue
    const content = file.content.toString('utf-8')
    const { name, description, version, installedFrom } = parseFrontmatter(content)
    entries.push({ slug: match[1], name, description, content, version, installedFrom })
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** A platform library skill ships in hq's image; an org library skill's source lives on hq's own storage. */
export function librarySkillSourceDir(skill: Pick<InstallableSkill, 'scope' | 'assetPath'>): string {
  return skill.scope === 'PLATFORM' ? resolveHqAssetPath(skill.assetPath) : path.join(getHqStorageRoot(), skill.assetPath)
}

/** A library skill as installed: provenance frontmatter over its body, plus top-level companion files. No install time, so re-installing the same skill changes nothing. */
export async function librarySkillFiles(skill: InstallableSkill): Promise<PackageFileInput[]> {
  const dir = librarySkillSourceDir(skill)
  const raw = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf-8')
  const bodyMatch = raw.match(/^---[\s\S]*?---\r?\n?([\s\S]*)/)
  const body = bodyMatch ? bodyMatch[1].trimStart() : raw
  const frontmatter = `---\nname: ${skill.name}\nslug: ${skill.slug}\ndescription: ${skill.description}\nversion: ${skill.version}\nscope: ${skill.scope}\ninstalled_from: ${skill.id}\n---`
  const files: PackageFileInput[] = [{ path: 'SKILL.md', content: Buffer.from(`${frontmatter}\n\n${body}`, 'utf-8') }]
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!entry.isFile() || entry.name === 'SKILL.md' || !isValidPackagePath(entry.name)) continue
    files.push({ path: entry.name, content: await fs.readFile(path.join(dir, entry.name)) })
  }
  return files
}
