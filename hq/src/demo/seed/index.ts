import { seedIds, seedTime, type DemoSeed } from '@agenthix/core'
import { seedActivity } from './activity'
import { seedLibrary } from './library'
import { seedModels } from './models'
import { seedOrganisation } from './organisation'
import type { SeedContext, SeedDb, SeedDeps } from './types'

export type { SeedDb, SeedDeps } from './types'

export type SeedPlace = { siteId: string; siteLogicalId: string; kernelId: string }

/**
 * Writes hq's part of the demo's sample organisation: everything hq holds (people, projects, tasks, the library, models
 * and usage), dated around `deps.now`, with the fixed identifiers the site's part shares. It runs in one transaction the
 * caller opens, so a failure leaves nothing half written. It only ever adds: the caller runs it on an empty database.
 */
export async function seedHqDemo(db: SeedDb, seed: DemoSeed, place: SeedPlace, deps: SeedDeps): Promise<void> {
  const context: SeedContext = { db, seed, ids: seedIds(seed), deps, ...place, at: minutes => seedTime(deps.now, minutes) }
  await seedOrganisation(context)
  await seedActivity(context)
  await seedLibrary(context)
  await seedModels(context)
}
