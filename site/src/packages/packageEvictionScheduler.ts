import { Logger } from '../server/utils/logger'
import { evictPackages } from './packageEviction'
import { protectedPackageDigests } from './protectedPackages'

const logger = new Logger('PackageEviction')
let running: Promise<void> | null = null

/** One eviction pass at a time; a request while one runs is folded into it. */
export function schedulePackageEviction(): void {
  if (running) return
  running = (async () => {
    const removed = await evictPackages(await protectedPackageDigests())
    if (removed > 0) logger.info(`evicted ${removed} cached package entr(ies)`)
  })()
    .catch(err => logger.warn(`package eviction failed: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => { running = null })
}
