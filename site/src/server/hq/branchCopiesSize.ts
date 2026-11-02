import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'

/** Owners' folders that hold branch copies, under the storage root (`storage/paths.ts`). */
const OWNER_KINDS = ['projects', 'users']

/** Bytes under a folder, counting each entry as the disk does and never following a link: an agent writes these folders. */
async function sizeOf(dir: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await sizeOf(p)
    else {
      try {
        const s = await lstat(p)
        total += s.blocks * 512
      } catch { /* gone while counting */ }
    }
  }
  return total
}

/** The disk the branches' working copies use: every owner's `clones/` folder. */
export async function branchCopiesBytes(storageRoot: string): Promise<number> {
  let total = 0
  for (const kind of OWNER_KINDS) {
    let owners: string[]
    try {
      owners = await readdir(path.join(storageRoot, kind))
    } catch {
      continue
    }
    for (const owner of owners) total += await sizeOf(path.join(storageRoot, kind, owner, 'clones'))
  }
  return total
}

const FRESH_MS = 5 * 60_000
let kept: { at: number; bytes: number | null } | null = null

/** Counting walks every file, so a report reuses a figure taken within five minutes. Null when it could not be counted. */
export async function branchCopiesReport(
  storageRoot: string,
  now: () => number = Date.now,
  count: (root: string) => Promise<number> = branchCopiesBytes,
): Promise<{ usedBytes: number } | null> {
  if (!kept || now() - kept.at >= FRESH_MS) {
    kept = { at: now(), bytes: await count(storageRoot).catch(() => null) }
  }
  return kept.bytes === null ? null : { usedBytes: kept.bytes }
}

/** Test-only. */
export function __forgetBranchCopiesForTests(): void {
  kept = null
}
