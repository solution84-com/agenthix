/**
 * hq read-only while it moves to a new machine (host-management spec §13: "hq is read-only from the moment the move's
 * backup starts, with notice, so nothing is lost between the backup and the switch"). Turned on and off only by the
 * host service on hq's machine, through the control socket (fleet/hqMove.ts); kept in memory, so an hq started anew
 * — the one restored on the new machine, or this one started again after a rollback — is writable.
 *
 * While it is on, people can read but not change anything:
 *
 * - **Wasp operations.** Wasp 0.25 serves queries and actions alike as `POST /operations/<kebab-case name>`, with the
 *   same handler wrapper, so nothing in the request tells them apart. The guard answers a query by name from the list
 *   of queries hq declares (readOnlyQueries.ts, checked against what Wasp generated) and refuses every other
 *   operation — an action, or one the list does not know.
 * - **Other routes.** Reads (`GET`, `HEAD`, `OPTIONS`) answer; a write is refused, but for signing in and out and the
 *   few `POST`s that read or check (`ANSWERS_WHILE_READ_ONLY`) — the move check above all, which sites and machines
 *   use to follow hq to its new address.
 * - **The site channel.** A site's events, which would change hq's data, are held in order and handled when the mode
 *   ends without a move (a rollback); when hq has moved, this hq stops with them, as with anything after the backup.
 *
 * Each refusal is the one sentence `readOnlySentence` gives, as `503` with `{ message }`, which Wasp's client shows.
 */
import type { RequestHandler } from 'express'
import { WASP_QUERIES } from './readOnlyQueries'
import { Logger } from './utils/logger'

const logger = new Logger('ReadOnly')

export type ReadOnly = {
  /** The machine hq is moving to, for the sentence; null when it is not known. */
  to: string | null
  since: string
}

const QUERY_ROUTES = new Set(WASP_QUERIES.map(name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)))

/** The writes that still answer: they read, check, or sign someone in or out, and change nothing people made. */
export const ANSWERS_WHILE_READ_ONLY: ReadonlySet<string> = new Set([
  '/auth/username/login',
  '/auth/logout',
  '/api/v1/move-check',
  '/api/v1/move-check/proof',
  '/api/auth/site-token',
  '/api/v1/capabilities/renew',
  '/api/auth/validate-invite',
  '/api/auth/password-reset/read',
])

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const MAX_HELD = 10_000

let current: ReadOnly | null = null
let held: (() => Promise<void>)[] = []

export function readOnlyNow(): ReadOnly | null {
  return current
}

export function readOnlySentence(r: ReadOnly): string {
  return `HQ is moving${r.to ? ` to ${r.to}` : ''}; changes are paused until the move ends.`
}

/** On with `r`, or off with null; off hands the held site events on, in the order they came. */
export function setReadOnly(r: ReadOnly | null): void {
  current = r
  if (r) return
  const queue = held
  held = []
  void queue.reduce((chain, work) => chain.then(work).catch(() => {}), Promise.resolve())
}

/** Whether `method` and `path` change something, so read-only refuses them. */
export function refusedWhileReadOnly(method: string, path: string): boolean {
  if (READS.has(method.toUpperCase())) return false
  const operation = /^\/operations\/([a-z0-9-]+)\/?$/.exec(path)
  if (operation) return !QUERY_ROUTES.has(operation[1])
  return !ANSWERS_WHILE_READ_ONLY.has(path.replace(/\/+$/, ''))
}

export const readOnlyGuard: RequestHandler = (req, res, next) => {
  const r = current
  if (!r || !refusedWhileReadOnly(req.method, req.originalUrl.split('?')[0])) return next()
  res.status(503).set('Retry-After', '60').json({ message: readOnlySentence(r), readOnly: true })
}

/**
 * A site's event while read-only is held, and true is answered; otherwise false, and the caller handles it now: when
 * read-only is off, and also when `MAX_HELD` events are already held, since an event is never answered as held and then
 * dropped.
 */
export function holdWhileReadOnly(work: () => Promise<void>): boolean {
  if (!current) return false
  if (held.length >= MAX_HELD) {
    logger.warn(`${MAX_HELD} site events are already held while HQ is read-only, so this one is handled now.`)
    return false
  }
  held.push(work)
  return true
}
