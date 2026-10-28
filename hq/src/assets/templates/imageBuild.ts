/**
 * Agenthix's build of its own templates (spec part 2 *Self-contained packages*, I5; problem T11). A template in hq's
 * image holds only what is its own: its files and its role skills. Every shared skill it needs is named by the agents
 * that have it (`agent.json`'s `skills`) and copied in here, from its one source on the shelf, with a `package.json`
 * at the shelf skill's version, so installing the template finds the shelf skill already there by identity (I3) and
 * nothing is kept twice by hand.
 *
 * It runs when hq reads its image, at boot, rather than when the image is built: the image's files are what is signed
 * (adr-0117), dev and tests read the same folders, and no generated copy can drift from its source. A template that
 * keeps a copy of a shelf skill, or names one no source has, fails here, and boot reports it.
 *
 * Built-in skills are not carried: every agent has them already, and nothing may be installed over one (`plan.ts`).
 */
import { AGENTHIX_PUBLISHER, ASSET_MANIFEST_FILE, ASSET_MANIFEST_FORMAT, isAssetName } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { readPlatformSkills } from '../builtins/platformSkills'
import { readParts } from '../install/parts'
import { SKILL_FILE } from '../skillFile'
import { listShelf } from '../sources/imageShelf'
import { AGENT_FILE } from '../install/templateFiles'

export class ImageBuildError extends Error {}

export type SkillSource = { name: string; version: string; description: string; files: PackageFile[] }
export type SkillSources = { shelf: Map<string, SkillSource>; builtIn: Set<string> }

export async function readSkillSources(): Promise<SkillSources> {
  const [shelf, platform] = await Promise.all([listShelf(), readPlatformSkills().catch(() => ({ skills: [] }))])
  return {
    shelf: new Map(shelf.map(s => [s.name, { name: s.name, version: s.version, description: s.description || s.title, files: s.files }])),
    builtIn: new Set(platform.skills.map(s => s.name)),
  }
}

const text = (s: string) => Buffer.from(s, 'utf-8')

/** The `package.json` a carried shelf skill gets: its own identity and version, under the template's publisher. */
export function carriedManifest(source: SkillSource): PackageFile {
  const manifest = { format: ASSET_MANIFEST_FORMAT, kind: 'skill', publisher: AGENTHIX_PUBLISHER, name: source.name, version: source.version, description: source.description }
  return { path: ASSET_MANIFEST_FILE, content: text(`${JSON.stringify(manifest, null, 2)}\n`) }
}

function jsonIn(files: PackageFile[], path: string): Record<string, unknown> | null {
  const file = files.find(f => f.path === path)
  if (!file) return null
  try {
    const raw = JSON.parse(file.content.toString('utf-8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Every skill the template's agents name: an agent template's one `agent.json`, a team template's `agents/<handle>/agent.json`. */
export function declaredSkills(files: PackageFile[]): string[] {
  const agentFiles = files.filter(f => f.path === AGENT_FILE || /^agents\/[^/]+\/agent\.json$/.test(f.path))
  const names = agentFiles.flatMap(f => {
    const skills = jsonIn(files, f.path)?.skills
    return Array.isArray(skills) ? skills.filter((s): s is string => typeof s === 'string') : []
  })
  return [...new Set(names)].sort()
}

function ownFolders(files: PackageFile[]): Set<string> {
  return new Set(files.filter(f => f.path.startsWith('skills/')).map(f => f.path.split('/')[1]))
}

/**
 * The template's package as installed: its own files, and a copy of each shared skill its agents name. Throws
 * `ImageBuildError` naming every problem: a copy of a shelf skill kept in the template, a built-in named, or a name no
 * source has.
 */
export function buildTemplate(root: string, files: PackageFile[], sources: SkillSources): PackageFile[] {
  const own = ownFolders(files)
  const problems: string[] = []
  for (const folder of own) {
    if (sources.shelf.has(folder)) problems.push(`skills/${folder} is a copy of the shelf's ${folder}: name it in agent.json and the build copies it`)
    if (files.some(f => f.path === `skills/${folder}/${ASSET_MANIFEST_FILE}`)) problems.push(`skills/${folder} has a package.json: a shared skill comes from its one source, never a copy`)
  }
  const copies: PackageFile[] = []
  for (const name of declaredSkills(files)) {
    if (own.has(name) && files.some(f => f.path === `skills/${name}/${SKILL_FILE}`)) continue
    if (!isAssetName(name)) problems.push(`names the skill “${String(name).slice(0, 64)}”, which isn't a skill name`)
    else if (sources.builtIn.has(name)) problems.push(`names ${name}, which is built in: every agent has it already, so no template names it`)
    else {
      const source = sources.shelf.get(name)
      if (!source) problems.push(`names the skill ${name}, which no source has (not on the shelf, not a role skill of its own)`)
      else copies.push(...[...source.files.filter(f => f.path !== ASSET_MANIFEST_FILE), carriedManifest(source)].map(f => ({ path: `skills/${name}/${f.path}`, content: f.content })))
    }
  }
  if (problems.length) throw new ImageBuildError(`${root}: ${problems.join('; ')}.`)
  return [...files, ...copies].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** The same package at another version: only its `package.json`'s version changes, written as the build writes it. */
export function stampVersion(files: PackageFile[], version: string): PackageFile[] {
  return files.map(f => {
    if (f.path !== ASSET_MANIFEST_FILE) return f
    const manifest = JSON.parse(f.content.toString('utf-8')) as Record<string, unknown>
    return { path: f.path, content: text(`${JSON.stringify({ ...manifest, version }, null, 2)}\n`) }
  })
}

/** The version the template's own `package.json` gives, read as the pipeline reads it. */
export function sourceVersion(root: string, files: PackageFile[]): string {
  return readParts({ root, files }).version
}
