/**
 * The code workspaces in a boundary, each bound read-only over its place in the run's container (live preview spec,
 * *Where the copy lives*). A workspace is a code workspace when its folder holds a `.git`, whatever made it: the site
 * decides from the folder, never from what a run says.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { LocationMount } from './containerTypes'

export async function codeWorkspaceMounts(boundary: LocationMount, workspaces: { id: string }[]): Promise<LocationMount[]> {
  const mounts: LocationMount[] = []
  for (const ws of [...workspaces].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const hostDir = `${boundary.hostDir}/workspaces/${ws.id}`
    if (await fs.lstat(path.join(hostDir, '.git')).then(() => true, () => false)) {
      mounts.push({ hostDir, containerDir: `${boundary.containerDir}/workspaces/${ws.id}` })
    }
  }
  return mounts
}

/** Where a branch's copy is inside the run's container: `clones/<copyId>` beside `workspaces/`. */
export function copyContainerDir(boundary: LocationMount, copyId: string): string {
  return `${boundary.containerDir}/clones/${copyId}`
}

/** What a run that is not code work is told of a code workspace's own folder, beside its path. */
export const CODE_WORKSPACE_FOLDER_NOTE =
  "a code workspace's own folder: it is the workspace's `main`, and it is read-only. Changing it takes a task given " +
  'this workspace, or a conversation started in the workspace, which works on a branch of its own. Never copy it ' +
  'elsewhere to change it, or write a patch for someone to apply.'

/**
 * The folders a run's prompt lists, with each code workspace's own folder marked as `main` and read-only (W9 of the
 * live preview walk: a task given no workspace read the code and wrote a patch file instead of changing it).
 */
export function markCodeWorkspaceFolders<T extends { containerDir: string; description?: string }>(
  locations: readonly T[], readOnly: readonly LocationMount[],
): T[] {
  const code = new Set(readOnly.map(m => m.containerDir))
  return locations.map(l => (code.has(l.containerDir)
    ? { ...l, description: l.description ? `${l.description}; ${CODE_WORKSPACE_FOLDER_NOTE}` : CODE_WORKSPACE_FOLDER_NOTE }
    : l))
}
