/**
 * The storage locations this site currently holds, as boundary keys.
 *
 * ADR-0057 made a container belong to a storage location, so the boot sweep asks
 * "is this location still here?" rather than "is this agent still here?".
 * Ownership is encoded in the path and derived, never stored (ADR-0039), so the
 * disk itself is the register: a directory under `projects/` or `users/` is an
 * owner whose storage lives on this site.
 *
 * Deliberately a SUPERSET of live owners: a deleted project's directory can linger, so its
 * container stays adopted and reaped by the idle sweep rather than going
 * un-swept. Conservative in the direction that never removes a container a live
 * boundary is about to use.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getStorageRoot } from './paths'

const OWNER_DIRS: { ownerType: 'project' | 'user'; plural: string }[] = [
  { ownerType: 'project', plural: 'projects' },
  { ownerType: 'user', plural: 'users' },
]

/** `<ownerType>:<ownerId>` per boundary — the same rendering `_start` stamps as
 *  the `agenthix.owner` label, so the sweep compares like with like. */
export async function listStorageBoundaries(): Promise<Set<string>> {
  const root = getStorageRoot()
  const boundaries = new Set<string>()
  for (const { ownerType, plural } of OWNER_DIRS) {
    let entries
    try {
      entries = await fs.readdir(path.join(root, plural), { withFileTypes: true })
    } catch {
      continue  // this site holds no storage of that kind yet
    }
    for (const entry of entries) {
      if (entry.isDirectory()) boundaries.add(`${ownerType}:${entry.name}`)
    }
  }
  return boundaries
}
