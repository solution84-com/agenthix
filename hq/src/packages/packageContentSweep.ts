/**
 * Removes content nothing names (ADR-0072). Content is kept for
 * PACKAGE_CONTENT_GRACE_MS after the last package moved off it, so a run that
 * started before an edit is still served the content it named. Content a
 * holder names is never removed: a package's current content, and every asset
 * version, draft and its revisions, proposal and place skill version (skills
 * spec, Retention). The query requires that none names it, and each relation
 * refuses the delete besides.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { Db } from './packageStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Packages')

export const PACKAGE_CONTENT_GRACE_MS = 24 * 60 * 60 * 1000
export const PACKAGE_CONTENT_SWEEP_INTERVAL_MS = 60 * 60 * 1000

/** Every PackageContent relation that keeps its content; its own files are not one. */
export const CONTENT_HOLDERS = [
  'packages', 'assetVersions', 'drafts', 'draftRevisions', 'proposals', 'placeSkillVersions',
] as const

type HolderFilter = { [K in (typeof CONTENT_HOLDERS)[number]]: { none: Record<string, never> } }

export function unreferencedContentWhere(now: Date): HolderFilter & Prisma.PackageContentWhereInput {
  const cutoff = new Date(now.getTime() - PACKAGE_CONTENT_GRACE_MS)
  const none = Object.fromEntries(CONTENT_HOLDERS.map(h => [h, { none: {} }])) as HolderFilter
  return {
    ...none,
    // Released long enough ago — or never pointed at at all (a write that
    // lost a race outside a transaction) and old enough.
    OR: [{ releasedAt: { lt: cutoff } }, { releasedAt: null, createdAt: { lt: cutoff } }],
  }
}

export async function sweepUnreferencedContent(now: Date = new Date(), db: Db = prisma): Promise<number> {
  const { count } = await db.packageContent.deleteMany({ where: unreferencedContentWhere(now) })
  return count
}

let timer: NodeJS.Timeout | null = null

/** Sweeps once now and then every PACKAGE_CONTENT_SWEEP_INTERVAL_MS. A failed sweep is logged and retried at the next interval. */
export function startPackageContentSweep(): void {
  if (timer) return
  const run = () => {
    sweepUnreferencedContent()
      .then(n => { if (n > 0) logger.info(`swept ${n} unreferenced package content row(s)`) })
      .catch(err => logger.warn(`content sweep failed: ${err instanceof Error ? err.message : String(err)}`))
  }
  run()
  timer = setInterval(run, PACKAGE_CONTENT_SWEEP_INTERVAL_MS)
  timer.unref?.()
}
