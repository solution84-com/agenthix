/**
 * A runner's run staging (adr-0173; the layout is harnessHomes.ts, the folders runStagingFolders.ts): where the site
 * puts what it checked for a run — its skills and its pinned memory — and the read-only mount that hands it to the
 * runner's containers at `/run/staging`, on the container's read-only root and outside the writable harness home.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { RUN_STAGING_CONTAINER_DIR, runStagingFor } from './harnessHomes'
import { RUN_STAGING_PINNED_MEMORY, RUN_STAGING_SKILLS, type RunStaging } from './runStagingFolders'
import type { ContainerKey } from './containerTypes'

/** The run staging as the site writes it and as the run sees it: the container path under isolation, else the same. */
export function runStagingOf(key: ContainerKey): RunStaging {
  const serverDir = runStagingFor(key)
  return {
    serverDir,
    visibleDir: process.env.AGENT_CONTAINER_ISOLATION === 'true' ? RUN_STAGING_CONTAINER_DIR : serverDir,
  }
}

/** The docker bind, read-only. Built once, for `docker run`'s argv. */
export function runStagingBind(key: ContainerKey): string {
  return `${runStagingFor(key)}:${RUN_STAGING_CONTAINER_DIR}:ro`
}

/** Before `docker run`: the folder and both of its folders, so Docker never makes a missing source root-owned. */
export async function prepareRunStaging(key: ContainerKey): Promise<void> {
  const dir = runStagingFor(key)
  for (const folder of [RUN_STAGING_SKILLS, RUN_STAGING_PINNED_MEMORY]) await fs.mkdir(path.join(dir, folder), { recursive: true })
}
