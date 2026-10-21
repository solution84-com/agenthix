/**
 * The daily sweep that archives idle conversations, in hq's own process like the other sweeps; timers are unref'd.
 * A failure is logged and tried again at the next interval; the sweep never overlaps itself.
 */
import { Logger } from '../../server/utils/logger'
import { archiveIdleConversations } from './idle'

const logger = new Logger('ConversationArchive')

export const ARCHIVE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null

export function startConversationArchiveSweep(intervalMs = ARCHIVE_SWEEP_INTERVAL_MS): void {
  if (timer) return
  let running = false
  const run = () => {
    if (running) return
    running = true
    archiveIdleConversations()
      .catch(err => logger.warn(`sweep failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { running = false })
  }
  run()
  timer = setInterval(run, intervalMs)
  timer.unref?.()
}

export function stopConversationArchiveSweep(): void {
  if (timer) clearInterval(timer)
  timer = null
}
