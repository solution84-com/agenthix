/**
 * Agenthix's shelf in hq's image (spec part 1 L1b, part 3 *Sources*): skills offered to every organisation and
 * installed only when someone chooses one. hq's image is signed and verified before it runs (adr-0117), so a package
 * read from it is Agenthix's by where it is, with no bundle; nothing read from anywhere else takes that trust.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isAssetName } from '@agenthix/core'
import { getHqAssetsRoot } from '../../server/hqAssets'
import { readFileTree } from '../../library/packages/fileTree'
import { SKILL_FILE } from '../skillFile'
import { readParts, type PackageParts } from '../install/parts'
import type { Arrival } from '../install/types'

export class NotOnShelfError extends Error {
  constructor(name: string) { super(`Agenthix doesn't offer a skill called ${name.slice(0, 64)}. Nothing was changed.`) }
}

export function shelfDir(): string {
  return path.join(getHqAssetsRoot(), 'library', 'skills')
}

/** One shelf skill as the pipeline receives it. The name is checked before it touches the disk. */
export async function shelfArrival(name: string): Promise<Arrival> {
  if (!isAssetName(name)) throw new NotOnShelfError(String(name))
  const files = await readFileTree(path.join(shelfDir(), name))
  if (!files.some(f => f.path === SKILL_FILE)) throw new NotOnShelfError(name)
  return { source: 'image', arrived: { root: name, files }, bundle: null, sourceUrl: null }
}

export type ShelfSkill = PackageParts & { identity: string }

/** Every skill on the shelf, by name; a folder that can't be read as a skill is left out. */
export async function listShelf(): Promise<ShelfSkill[]> {
  const entries = await fs.readdir(shelfDir(), { withFileTypes: true }).catch(() => [])
  const out: ShelfSkill[] = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!entry.isDirectory() || !isAssetName(entry.name)) continue
    try {
      const parts = readParts((await shelfArrival(entry.name)).arrived)
      out.push({ ...parts, identity: `agenthix/${parts.name}` })
    } catch {
      continue
    }
  }
  return out
}
