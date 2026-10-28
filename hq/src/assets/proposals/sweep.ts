/**
 * The daily sweep that removes rejected proposals 90 days after their review (RQ5), in hq's own process like the other
 * sweeps; the timer is unref'd, a failure is logged and tried again the next day, and it never overlaps itself.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { removeOldRejected } from './queue'

const logger = new Logger('SkillProposals')
const DAY = 24 * 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null

export function startRejectedProposalSweep(intervalMs = DAY): void {
  if (timer) return
  let running = false
  const run = () => {
    if (running) return
    running = true
    removeOldRejected(prisma)
      .then(n => { if (n > 0) logger.info(`removed ${n} rejected proposal(s)`) })
      .catch(err => logger.warn(`sweep failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { running = false })
  }
  run()
  timer = setInterval(run, intervalMs)
  timer.unref?.()
}
