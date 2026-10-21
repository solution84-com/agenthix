/**
 * Removes content no package points at (ADR-0072). Content is kept for
 * PACKAGE_CONTENT_GRACE_MS after the last package moved off it, so a run that
 * started before an edit is still served the content it named. Current content
 * is never removed: the query requires that no package points at it, and the
 * Package → PackageContent relation refuses the delete besides.
 */
import { prisma } from 'wasp/server'
import type { Db } from './packageStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Packages')

export const PACKAGE_CONTENT_GRACE_MS = 24 * 60 * 60 * 1000
export const PACKAGE_CONTENT_SWEEP_INTERVAL_MS = 60 * 60 * 1000

export async function sweepUnreferencedContent(now: Date = new Date(), db: Db = prisma): Promise<number> {
  const cutoff = new Date(now.getTime() - PACKAGE_CONTENT_GRACE_MS)
  const { count } = await db.packageContent.deleteMany({
    where: {
      packages: { none: {} },
      // Released long enough ago — or never pointed at at all (a write that
      // lost a race outside a transaction) and old enough.
      OR: [{ releasedAt: { lt: cutoff } }, { releasedAt: null, createdAt: { lt: cutoff } }],
    },
  })
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
