/**
 * A library item's folder, read into package files and written back from them.
 * Links and hidden names are skipped on reading; writing goes only inside hq's
 * own storage, checked against its real path (`server/realPathWithin.ts`),
 * whatever folder the caller names.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidPackagePath } from '@agenthix/core'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import { resolveRealWriteTargetWithin } from '../../server/realPathWithin'
import type { PackageFile } from './packageZip'

export async function readFileTree(dir: string): Promise<PackageFile[]> {
  const out: PackageFile[] = []
  async function walk(at: string, rel: string[]): Promise<void> {
    const entries = await fs.readdir(at, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.name.startsWith('.')) continue
      const relative = [...rel, entry.name]
      if (!isValidPackagePath(relative.join('/'))) continue
      if (entry.isDirectory()) await walk(path.join(at, entry.name), relative)
      else if (entry.isFile()) out.push({ path: relative.join('/'), content: await fs.readFile(path.join(at, entry.name)) })
    }
  }
  await walk(dir, [])
  return out
}

/** Replaces the folder at `relativeDir` (under hq's storage) with exactly these files. */
export async function replaceStorageTree(relativeDir: string, files: PackageFile[]): Promise<void> {
  const root = getHqStorageRoot()
  const dir = path.resolve(root, relativeDir)
  if (!dir.startsWith(root + path.sep)) throw new Error('Path not allowed')
  await fs.rm(dir, { recursive: true, force: true })
  for (const file of files) {
    const target = await resolveRealWriteTargetWithin(root, path.join(dir, file.path))
    if (!target) throw new Error('Path not allowed')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content)
  }
}
