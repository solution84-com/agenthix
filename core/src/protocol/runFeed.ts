/**
 * The order of a run feed and the cursor that pages it, shared by the site
 * (which orders and filters its rows) and hq (which merges several sites'
 * answers) — `run.listPage` in `runtimeData.ts`.
 */

/**
 * What a run is ordered by in a feed: when it started, or when it was created
 * if it never did.
 *
 * The fallback is not a nicety. `startedAt` is null until the PENDING→RUNNING
 * transition and stays null for ever on a run that failed or was cancelled
 * before it launched, so a sort keyed on `startedAt` alone has a permanent
 * block of null-keyed rows in it. Wherever that block sorts, it breaks
 * something: below the started rows it is unreachable, because a cursor
 * comparing against a timestamp can never match a null; above them it is a
 * months-old dispatch failure pinned to the top of the feed for ever.
 * Coalescing removes the null from the key instead of choosing which of those
 * to live with. `createdAt` is on every run and is already what `run.list`
 * orders by.
 *
 * Both sides compute it from here — the site to order and filter its rows, hq
 * to merge several sites' answers — because an order and a cursor that
 * disagree about the key silently skip rows.
 */
export function runFeedKey(row: { startedAt: string | null; createdAt: string }): string {
  return row.startedAt ?? row.createdAt
}

/**
 * One row's place in the feed's `(runFeedKey, id)` descending order, as
 * `run.listPage`'s `before` carries it. Shared rather than written twice: hq
 * builds a cursor from a row it consumed and the site parses it back, and two
 * spellings of one format is how a page starts silently skipping.
 *
 * **It is not opaque.** It is base64 inside the feed cursor that carries it,
 * and base64 is an encoding, not a secret. A reader can recover the key and id
 * of the oldest row each site was read past — see `mergedRunFeed.ts` in hq,
 * which says what that means for a viewer.
 */
export function runPageCursor(row: { startedAt: string | null; createdAt: string; id: string }): string {
  return `${runFeedKey(row)}|${row.id}`
}

/**
 * Reads a cursor back, or null if it does not parse. Null means "start at the
 * top", never an error: a person following a stale or mangled link gets the
 * first page rather than a failure they cannot act on.
 */
export function parseRunPageCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null
  const sep = cursor.indexOf('|')
  if (sep <= 0) return null
  const at = cursor.slice(0, sep)
  const id = cursor.slice(sep + 1)
  if (!id || Number.isNaN(Date.parse(at))) return null
  return { at, id }
}
