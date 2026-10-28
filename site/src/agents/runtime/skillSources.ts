/**
 * What a run may stage, read into memory from exactly what hq named (spec part 4 *Defaults and switches*, part 5
 * *Delivery per turn*, adr-0084, adr-0159):
 *
 * - the platform package's own skills, as before (built-ins are phase 4's);
 * - installed and personal skills, from their delivered content in the package cache, by a `skill` ref whose digest is
 *   the entry's, and whose files there still fingerprint to it;
 * - skills in the place's files, each read from the place, path and fingerprint hq named and kept only when what is
 *   read now fingerprints to exactly that (security review H3).
 *
 * The org and agent packages' own `skills/`, and the place's folders read directly, are no longer sources. Anything
 * named but not kept comes back as a refusal with its reason, for the run's record. Never throws.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ASSET_MANIFEST_FILE, MAX_WORKSPACE_SKILL_INDEX, isAssetFingerprint, isPackageRef, namespacedSkillName,
  parseAssetIdentity, workspaceSkillName,
  type FileSkillEntry, type InstalledSkillEntry, type InstalledSkillLevel, type PackageRef, type PersonSkillEntry,
  type SkillSource,
} from '@agenthix/core'
import { resolvePackage } from '../../packages/packageCache'
import { parseNamedSkillPath, placeFilesHome, workspaceHome, type NamedSkillPath, type SkillPlace } from '../../packages/placeSkillHomes'
import {
  SKILL_TREE_REFUSALS, newSkillTreeBudget, readSkillTree, skillFingerprint,
  type SkillFile, type SkillTreeBudget,
} from './skillTree'

/** What hq named for a run, beside its packages. Null when the dispatch carried none. */
export type RunSkillInputs = {
  place: SkillPlace
  agentId: string
  /** The person the run is for, recorded on their own skills (security review M6). */
  personId: string | null
  installed: InstalledSkillEntry[]
  files: FileSkillEntry[]
  person: PersonSkillEntry[]
}

export type SkillOrigin = { identity?: string; version?: string; placeId?: string; path?: string; personId?: string }

export type SkillCandidate = { source: SkillSource; slug: string; name: string; fingerprint: string; files: SkillFile[]; origin: SkillOrigin }

export type SkillRefusal = { source: SkillSource; name?: string; fingerprint: string; origin: SkillOrigin; reason: string }

export type SkillSourcesResult = { candidates: SkillCandidate[]; refused: SkillRefusal[] }

const LEVEL_SOURCE: Record<InstalledSkillLevel, SkillSource> = { builtin: 'platform', org: 'org', agent: 'agent' }

const fingerprintOrEmpty = (value: unknown) => (isAssetFingerprint(value) ? value : '')

/** The platform package's skills, each folder of `skills/` a skill. Site-owned, verified content, bounded per skill. */
async function platformSkills(platformDir: string, out: SkillSourcesResult): Promise<void> {
  const root = path.join(platformDir, 'skills')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries.filter(e => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = namespacedSkillName('platform', entry.name)
    if (!name) continue
    const read = await readSkillTree(path.join(root, entry.name), { home: null, budget: newSkillTreeBudget() })
    if (!read.ok) {
      out.refused.push({ source: 'platform', name, fingerprint: '', origin: {}, reason: SKILL_TREE_REFUSALS[read.reason] })
      continue
    }
    out.candidates.push({ source: 'platform', slug: entry.name, name, fingerprint: skillFingerprint(read.files), files: read.files, origin: {} })
  }
}

/** One installed or personal skill, from the package cache: its files there must still be the content hq named. */
async function deliveredSkill(
  source: SkillSource,
  entry: { identity: string; version: string; digest: string; ref?: PackageRef },
  origin: SkillOrigin,
  out: SkillSourcesResult,
): Promise<void> {
  const identity = parseAssetIdentity(entry.identity)
  const slug = identity ? identity.name.slice(identity.name.lastIndexOf('/') + 1) : ''
  const name = identity ? namespacedSkillName(source, slug) ?? undefined : undefined
  const refuse = (reason: string) => out.refused.push({ source, name, fingerprint: fingerprintOrEmpty(entry.digest), origin, reason })
  if (!name) return void refuse('its identity does not make a skill name a run can use')
  const ref = entry.ref
  if (!isPackageRef(ref) || ref.kind !== 'skill' || ref.digest !== entry.digest) {
    return void refuse('hq named no content for it, or content of another digest')
  }
  let dir: string
  try {
    dir = await resolvePackage(ref)
  } catch {
    return void refuse("its content is not in this site's cache")
  }
  const read = await readSkillTree(dir, { home: null, budget: newSkillTreeBudget() })
  if (!read.ok) return void refuse(SKILL_TREE_REFUSALS[read.reason])
  if (skillFingerprint(read.files) !== entry.digest) return void refuse("its cached content no longer matches what hq named")
  // The asset's manifest says what it is; it is not part of the skill a run reads.
  const files = read.files.filter(f => f.path !== ASSET_MANIFEST_FILE)
  out.candidates.push({ source, slug, name, fingerprint: entry.digest, files, origin })
}

type ParsedFileSkill = { entry: FileSkillEntry; at: NamedSkillPath }

/** `workspace-<n>-<slug>`: n numbers each workspace and folder named in this run, in a fixed order. */
function workspaceNumbers(parsed: ParsedFileSkill[]): Map<string, number> {
  const pairs = [...new Set(parsed.flatMap(p => (p.at.group === 'workspace' ? [`${p.at.workspaceId}/${p.at.root}`] : [])))].sort()
  return new Map(pairs.map((pair, i) => [pair, i + 1]))
}

async function fileSkills(inputs: RunSkillInputs, out: SkillSourcesResult): Promise<void> {
  const budget: SkillTreeBudget = newSkillTreeBudget()
  const parsed: ParsedFileSkill[] = []
  for (const entry of inputs.files) {
    const origin: SkillOrigin = { placeId: String(entry.placeId), path: String(entry.path) }
    const source: SkillSource = entry.group === 'agent' ? 'boundary' : entry.group === 'workspace' ? 'workspace' : 'shared'
    const refuse = (reason: string) => out.refused.push({ source, fingerprint: fingerprintOrEmpty(entry.fingerprint), origin, reason })
    const at = parseNamedSkillPath(entry.group, entry.path)
    if (!at) refuse('its path is not one a skill in files may have')
    else if (entry.placeId !== inputs.place.ownerId) refuse('it is not in the place this run works in')
    else if (at.group === 'agent' && at.agentId !== inputs.agentId) refuse("it is another agent's")
    else if (!isAssetFingerprint(entry.fingerprint)) refuse('hq named no fingerprint for it')
    else parsed.push({ entry, at })
  }
  const numbers = workspaceNumbers(parsed)
  const filesHome = parsed.some(p => p.at.group !== 'workspace') ? await placeFilesHome(inputs.place) : null
  const workspaceHomes = new Map<string, string | null>()

  for (const { entry, at } of parsed) {
    const origin: SkillOrigin = { placeId: entry.placeId, path: entry.path }
    const source: SkillSource = at.group === 'agent' ? 'boundary' : at.group === 'workspace' ? 'workspace' : 'shared'
    const name = at.group === 'workspace'
      ? workspaceSkillName(numbers.get(`${at.workspaceId}/${at.root}`) ?? MAX_WORKSPACE_SKILL_INDEX + 1, at.slug)
      : namespacedSkillName(source, at.slug)
    const refuse = (reason: string) => out.refused.push({ source, name: name ?? undefined, fingerprint: entry.fingerprint, origin, reason })
    if (!name) {
      refuse('its name, with where it comes from, is longer than a skill name may be, or the run names too many workspace folders')
      continue
    }
    let home = filesHome
    if (at.group === 'workspace') {
      if (!workspaceHomes.has(at.workspaceId)) workspaceHomes.set(at.workspaceId, await workspaceHome(inputs.place, at.workspaceId))
      home = workspaceHomes.get(at.workspaceId) ?? null
    }
    if (!home) {
      refuse("its folder is not where this place's files are")
      continue
    }
    const read = await readSkillTree(path.join(home, ...at.root.split('/'), at.slug), { home, budget })
    if (!read.ok) {
      refuse(SKILL_TREE_REFUSALS[read.reason])
      continue
    }
    if (skillFingerprint(read.files) !== entry.fingerprint) {
      refuse('it has changed since it was switched on')
      continue
    }
    out.candidates.push({ source, slug: at.slug, name, fingerprint: entry.fingerprint, files: read.files, origin })
  }
}

export async function runSkillSources(platformDir: string, inputs: RunSkillInputs | null): Promise<SkillSourcesResult> {
  const out: SkillSourcesResult = { candidates: [], refused: [] }
  await platformSkills(platformDir, out)
  if (!inputs) return out
  for (const entry of inputs.installed) {
    const source = LEVEL_SOURCE[entry.level] ?? 'agent'
    await deliveredSkill(source, entry, { identity: entry.identity, version: entry.version }, out)
  }
  await fileSkills(inputs, out)
  for (const entry of inputs.person) {
    const origin: SkillOrigin = { identity: entry.identity, version: entry.version, ...(inputs.personId ? { personId: inputs.personId } : {}) }
    await deliveredSkill('person', entry, origin, out)
  }
  return out
}
