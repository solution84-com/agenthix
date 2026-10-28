/**
 * `location.scanSkills` (site protocol 1.10, spec part 4 *Defaults and switches*, security review L1): every skill
 * folder in a place's `.agents/skills/`, one agent's `.agents/agents/<agent id>/skills/` and, for each workspace named,
 * its repository's `.agents/skills/`, `.claude/skills/` and `.github/skills/`, with the fingerprint staging would check
 * it against. Each folder is read as staging reads it (skillTree.ts): hidden entries left out, links refused, within
 * the bounds of one scan in all, and at most `SCAN_SKILLS_MAX_PER_PLACE` skills reported. Nothing is stored.
 *
 * hq checks the person's access before it asks; the params carry no person. This site checks containment.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS, MAX_SKILL_SLUG_LENGTH, PLACE_SKILLS_ROOT, SCAN_SKILLS_MAX_PER_PLACE, SCAN_SKILLS_MAX_WORKSPACES,
  WORKSPACE_SKILL_ROOTS, agentSkillsRoot, isMetadataPath,
  type FileSkillGroup, type LocationScanSkillsResult, type ScannedSkill,
} from '@agenthix/core'
import { LOC_REF_SCHEMA } from './locationFileMethods'
import { parseParams } from './locationContainment'
import { placeFilesHome, workspaceHome } from '../../packages/placeSkillHomes'
import {
  SKILL_FILE, SKILL_TREE_REFUSALS, budgetSpent, newSkillTreeBudget, readSkillTree, skillFingerprint,
  type SkillTreeBudget,
} from '../../agents/runtime/skillTree'
import { summariseSkillMd } from '../../agents/runtime/skillMetadata'
import { isInsideHome, realpathOrNull } from '../../packages/boundaryOverrides'

const ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)

const PARAMS = z.object({
  loc: LOC_REF_SCHEMA,
  // Empty, or not a safe id, means no agent folder: a scan of the place alone (agentSkillsRoot gives none).
  agentId: z.string().max(256),
  workspaces: z.array(z.object({ id: ID, folder: z.string().max(512) })).max(SCAN_SKILLS_MAX_WORKSPACES).optional(),
})

const SLUG = /^[a-z0-9][a-z0-9-]*$/

type Root = {
  group: FileSkillGroup
  /** The real directory the root's skills must stay inside. */
  home: string
  /** The root, relative to `home`. */
  root: string
  found: Pick<ScannedSkill, 'agentId' | 'workspaceId' | 'workspaceFolder'>
}

type Scan = LocationScanSkillsResult & { budget: SkillTreeBudget }

/** The root's folders, or none when the root is absent or is not a plain directory inside its home. */
async function folders(root: Root): Promise<string[]> {
  const dir = path.join(root.home, ...root.root.split('/'))
  const real = await realpathOrNull(dir)
  if (!real || real !== dir || !isInsideHome(root.home, real)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries
    .filter(e => !isMetadataPath(e.name) && (e.isDirectory() || e.isSymbolicLink()))
    .map(e => e.name)
    .sort()
}

async function scanRoot(root: Root, scan: Scan): Promise<void> {
  for (const name of await folders(root)) {
    if (scan.skills.length >= SCAN_SKILLS_MAX_PER_PLACE || budgetSpent(scan.budget)) {
      scan.truncated = true
      return
    }
    const problem = (reason: string) => scan.problems.push({ group: root.group, path: name, reason })
    if (!SLUG.test(name) || name.length > MAX_SKILL_SLUG_LENGTH) {
      problem('its folder name is not a skill name: lowercase letters, digits and hyphens, short enough to stage')
      continue
    }
    const read = await readSkillTree(path.join(root.home, ...root.root.split('/'), name), { home: root.home, budget: scan.budget })
    if (!read.ok) {
      if (read.reason === 'bounds' && budgetSpent(scan.budget)) {
        scan.truncated = true
        return
      }
      if (read.reason !== 'no-skill') problem(SKILL_TREE_REFUSALS[read.reason])
      continue
    }
    const md = read.files.find(f => f.path === SKILL_FILE)
    const summary = summariseSkillMd(md ? md.content.toString('utf-8') : '')
    scan.skills.push({
      group: root.group, ...root.found, path: name, fingerprint: skillFingerprint(read.files),
      name: summary.name, description: summary.description,
      ...(summary.version ? { version: summary.version } : {}),
      ...(summary.identity ? { identity: summary.identity } : {}),
    })
  }
}

export async function scanSkills(params: unknown): Promise<LocationScanSkillsResult> {
  const { loc, agentId, workspaces } = parseParams(PARAMS, params, LOCATION_FILE_METHODS.scanSkills)
  const place = { ownerType: loc.ownerType, ownerId: loc.ownerId }
  const scan: Scan = { skills: [], problems: [], truncated: false, budget: newSkillTreeBudget() }
  const roots: Root[] = []
  const filesHome = await placeFilesHome(place)
  const agentRoot = agentSkillsRoot(agentId)
  if (filesHome) {
    roots.push({ group: 'place', home: filesHome, root: PLACE_SKILLS_ROOT, found: {} })
    if (agentRoot) roots.push({ group: 'agent', home: filesHome, root: agentRoot, found: { agentId } })
  }
  for (const ws of workspaces ?? []) {
    const home = await workspaceHome(place, ws.id)
    if (!home) continue
    for (const root of WORKSPACE_SKILL_ROOTS) {
      roots.push({ group: 'workspace', home, root, found: { workspaceId: ws.id, workspaceFolder: root } })
    }
  }
  for (const root of roots) {
    await scanRoot(root, scan)
    if (scan.truncated) break
  }
  return { skills: scan.skills, problems: scan.problems, truncated: scan.truncated }
}
