import type { DemoSeed } from '@agenthix/core'
import { seedSessions } from './rows'
import { seedFiles, seedWorkspaces } from './storage'
import type { SeedDb, SiteSeedDeps } from './types'

export type { SeedDb, SiteSeedDeps } from './types'

/**
 * Writes the site's part of the demo's sample organisation: the sessions' runs and transcripts, the workspaces, and the
 * files and Knowledge pages on the disk, dated around `deps.now`. Every id comes from the data, so hq's part (which
 * holds the people, the tasks and the projects these rows name) agrees without the two talking; the site does not
 * wait for hq. The rows go in one transaction the caller opens; the files are written after it commits.
 */
export async function seedSiteRows(db: SeedDb, seed: DemoSeed, deps: SiteSeedDeps): Promise<void> {
  await seedWorkspaces(db, seed, deps)
  await seedSessions(db, seed, deps.now)
}

export { seedFiles }
