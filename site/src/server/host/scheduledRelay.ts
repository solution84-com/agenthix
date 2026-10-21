/**
 * The site's part in scheduled changes (host-management spec §14, diagram 6): a change on this site's machine is
 * held by the host service there, which offers its notices with the machine's figures; the site passes each one up
 * its channel to hq as the one-way event `site.scheduledChange`. hq knows which site sent it from
 * the connection, so nothing here vouches for the notice beyond checking its shape.
 *
 * The host service keeps only the newest notice of each change and is never told what reached hq, so the site
 * sends each notice once per connection, and everything it still holds again when the channel reopens; hq keeps
 * whichever notice of a change is newest.
 */
import { parseScheduledChangeNotice, type ScheduledChangeNotice } from '@agenthix/core'

/** More than any machine schedules at once: a longer list is cut, never all sent. */
const MAX_NOTICES = 100

/** The notices out of a figures socket answer; none when it carries none or is not an answer. */
export function parseScheduledNotices(answer: unknown): ScheduledChangeNotice[] {
  const a = answer as { ok?: unknown; result?: { scheduledNotices?: unknown } } | null
  const list = a && a.ok === true ? a.result?.scheduledNotices : undefined
  if (!Array.isArray(list)) return []
  return list.slice(0, MAX_NOTICES).map(parseScheduledChangeNotice).filter((n): n is ScheduledChangeNotice => n !== null)
}

export type NoticeSource = {
  scheduledNotices: () => ScheduledChangeNotice[]
  onScheduledNotices: (listener: () => void) => () => void
}

/** While the channel is open: sends what the host service holds now, then each newer notice as it is read. */
export function startScheduledRelay(source: NoticeSource, send: (notice: ScheduledChangeNotice) => void): () => void {
  const sent = new Map<string, string>()
  const flush = () => {
    for (const notice of source.scheduledNotices()) {
      const key = `${notice.change.machine.fingerprint}\u0000${notice.change.id}`
      if (sent.get(key) === notice.sentAt) continue
      sent.set(key, notice.sentAt)
      send(notice)
    }
  }
  flush()
  return source.onScheduledNotices(flush)
}
