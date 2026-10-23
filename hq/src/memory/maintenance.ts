/**
 * Memory's background work, in hq's own process like the other sweeps: the background re-embed each minute, and
 * the tidy and the tuning of the probe's bars (barTuner.ts) once a day. Each logs a failure and tries again at its
 * next interval; none overlaps itself.
 */
import { Logger } from '../server/utils/logger'
import { reembedBatch } from './reembed'
import { tidyMemory } from './tidy'
import { tuneOrgBars } from './barTuner'

const logger = new Logger('Memory')

export const REEMBED_INTERVAL_MS = 60 * 1000
export const TIDY_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Batches per tick, so a large backlog moves steadily without holding the process. */
const REEMBED_BATCHES_PER_TICK = 20

let timers: NodeJS.Timeout[] = []

function exclusive(name: string, work: () => Promise<void>): () => void {
  let running = false
  return () => {
    if (running) return
    running = true
    work()
      .catch(err => logger.warn(`${name} failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { running = false })
  }
}

async function reembedTick(): Promise<void> {
  for (let i = 0; i < REEMBED_BATCHES_PER_TICK; i++) {
    const { embedded } = await reembedBatch()
    if (embedded === 0) return
  }
}

async function tidyTick(): Promise<void> {
  const { merged, archived, removed } = await tidyMemory()
  if (merged + archived + removed > 0) logger.info(`tidy: ${merged} merged, ${archived} archived as cold, ${removed} of places gone`)
}

async function tuneTick(): Promise<void> {
  const { changed, bars } = await tuneOrgBars()
  if (changed) logger.info(`recall bars tuned: certain ${bars.certain}, probable ${bars.probable}`)
}

export function startMemoryMaintenance(): void {
  if (timers.length > 0) return
  const reembed = exclusive('re-embed', reembedTick)
  const tidy = exclusive('tidy', tidyTick)
  const tune = exclusive('bar tuning', tuneTick)
  reembed()
  timers = [setInterval(reembed, REEMBED_INTERVAL_MS), setInterval(tidy, TIDY_INTERVAL_MS), setInterval(tune, TIDY_INTERVAL_MS)]
  for (const timer of timers) timer.unref?.()
}
