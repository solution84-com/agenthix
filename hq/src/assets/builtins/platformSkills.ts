/**
 * Agenthix's built-in skills as hq's image holds them (spec part 1 L1a, adr-0156): each folder of
 * `assets/platform/skills/` is one skill, `agenthix/<folder>`. The image is signed and verified before it runs
 * (adr-0117), so what is read here is Agenthix's by where it is. A folder that fails the Agent Skills rules is left out
 * and named, so a broken built-in is seen at boot rather than staged.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isAssetName } from '@agenthix/core'
import { getHqAssetsRoot } from '../../server/hqAssets'
import { readFileTree } from '../../library/packages/fileTree'
import type { PackageFile } from '../../library/packages/packageZip'
import { validateSkill } from '../validation'

export type PlatformSkill = { name: string; files: PackageFile[] }
export type PlatformSkillsRead = { skills: PlatformSkill[]; problems: string[] }

export function platformSkillsDir(): string {
  return path.join(getHqAssetsRoot(), 'platform', 'skills')
}

export async function readPlatformSkills(dir: string = platformSkillsDir()): Promise<PlatformSkillsRead> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out: PlatformSkillsRead = { skills: [], problems: [] }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (!isAssetName(entry.name)) {
      out.problems.push(`${entry.name}: a built-in skill's folder name must be 1 to 64 lowercase letters, digits and single hyphens.`)
      continue
    }
    const files = await readFileTree(path.join(dir, entry.name))
    const { errors } = validateSkill(entry.name, files)
    if (errors.length) out.problems.push(`${entry.name}: ${errors.join(' ')}`)
    else out.skills.push({ name: entry.name, files })
  }
  return out
}
