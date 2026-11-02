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
