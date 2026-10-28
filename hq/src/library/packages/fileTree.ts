/** A folder read into package files: links and hidden names are skipped. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isValidPackagePath } from '@agenthix/core'
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
