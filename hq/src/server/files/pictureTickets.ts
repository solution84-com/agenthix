/**
 * Pictures signed once per ticket life. An avatar or an organisation's picture shows many times on a busy screen, and
 * each link asked for would otherwise sign a ticket and write a `FileOpened` row. So the ticket hq last signed for a
 * picture is given again, for the same person, file version, purpose and relay, until it is within a minute of
 * expiring; only a new ticket is signed, and so recorded (T11 holds: every ticket signed is recorded).
 *
 * Access is still checked on every ask, before this. Task attachments, and every space but `upload`, sign per request.
 * The tickets are kept in memory, at most `max` of them, dropping the one used longest ago.
 */
import type { FileTicketInput } from '@agenthix/core'

type Issued = { token: string; expiresAt: number }
type Issue = (input: FileTicketInput) => Promise<Issued>

export const PICTURE_TICKET_REUSE_MARGIN_MS = 60_000
const DEFAULT_MAX = 2_000

const isPicture = (input: FileTicketInput): input is Extract<FileTicketInput, { space: 'upload' }> =>
  input.space === 'upload' && !input.path.startsWith('/files/')

export function reusePictureTickets(issue: Issue, opts: { now?: () => number; max?: number } = {}): Issue {
  const now = opts.now ?? Date.now
  const max = opts.max ?? DEFAULT_MAX
  // In flight or signed; a Map keeps insertion order, so the first key is the one used longest ago.
  const kept = new Map<string, Promise<Issued>>()
  const settled = new Map<Promise<Issued>, Issued>()

  return input => {
    if (!isPicture(input)) return issue(input)
    const key = JSON.stringify([input.relay, input.person, input.path, input.version, input.purpose])
    const held = kept.get(key)
    if (held) {
      const done = settled.get(held)
      if (!done || done.expiresAt - now() > PICTURE_TICKET_REUSE_MARGIN_MS) {
        kept.delete(key)
        kept.set(key, held)
        return held
      }
      kept.delete(key)
      settled.delete(held)
    }
    const fresh = issue(input).then(
      issued => {
        if (kept.get(key) === fresh) settled.set(fresh, issued)
        return issued
      },
      err => {
        if (kept.get(key) === fresh) kept.delete(key)
        throw err
      },
    )
    kept.set(key, fresh)
    while (kept.size > max) {
      const [oldestKey, oldest] = kept.entries().next().value as [string, Promise<Issued>]
      kept.delete(oldestKey)
      settled.delete(oldest)
    }
    return fresh
  }
}
