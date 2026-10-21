/**
 * One organisation's run feed, read across every Execution Site and paged.
 *
 * The other combined reads fold a total, and a total does not care where its
 * parts came from. A feed does. Runs live on the sites, an organisation can
 * run several, and the newest ten runs it has may all come from one of them or
 * from three — so an offset cannot be made correct here. "Skip the first
 * twenty" has no meaning when no site knows what the other sites returned, and
 * a feed built on one would repeat rows on one page and lose them on the next.
 *
 * So the cursor is PER SITE: each site is asked to continue from its own last
 * position, and the whole set of positions travels to the browser as one
 * string. A page is then the newest rows of the merged answers, in one order,
 * with every site's position advanced by exactly what this page read past.
 *
 * Three rules hold the paging together, and each exists because breaking it
 * loses rows silently rather than loudly.
 *
 * **A page may only reach as far down as every site has answered.** Each site
 * answers with a window, and a window that came back full says nothing about
 * what lies below it. So the page is cut at the NEWEST of those bottom edges
 * (`horizonOf` below): above that line the merged view is complete and the
 * order is true, below it another site may hold rows nobody has seen. A site
 * that came back short is exhausted and imposes no line at all. Without this
 * cut a page can emit an old row from one site while a newer row from another
 * sits unread just below that site's window — and the next page then returns
 * rows NEWER than the ones already shown, or, if nothing pages, never returns
 * them at all.
 *
 * **A site's position advances only past what this page read past.** A site
 * that returned fifty rows of which two made the page keeps the other
 * forty-eight for the next one; a site that contributed nothing to the page is
 * left exactly where it was; a site that did not answer keeps its position so
 * the next page can still pick it up.
 *
 * **Read past is not the same as shown.** A row the viewer may not see was
 * still read, and leaving it in front of the cursor would have the next page
 * fetch it, filter it out and advance nothing — a feed that pages for ever
 * without ever moving. So when a page comes back short of what it asked for,
 * every site advances to the horizon: the whole complete region was examined,
 * whatever the viewer was shown of it.
 *
 * A page can therefore come back shorter than `limit`, both because rows were
 * filtered and because the horizon cut it. `nextCursor` is what says whether
 * there is more; the row count never is.
 *
 * **A cursor that does not parse is the first page.** Someone with a stale or
 * mangled link gets the top of the feed; there is nothing they could do with
 * an error.
 *
 * **What the cursor carries, and who can read it.** It is base64url of JSON,
 * which is an encoding and not a secret — anyone holding the string can
 * recover it. What it holds is the position of the oldest row each site was
 * read past: a run id, a timestamp, and the organisation's site ids. Those
 * positions come from the sites' rows BEFORE the visibility filter, so a
 * position may name a run this viewer is not entitled to see. No content, no
 * project and no person is in it. Whether "a run happened, against a boundary
 * this viewer cannot see" is itself sensitive is a policy question recorded
 * outside this module and not settled here; if it is answered yes, this cursor
 * needs signing or per-viewer derivation, and page length would have to be
 * considered as a second, weaker channel of the same fact.
 */
import {
  runFeedKey,
  runPageCursor,
  type RunListPageParams,
  type RunListPageResult,
  type RunRow,
  type SiteAnswer,
  type SiteSilence,
} from '@agenthix/core'
import { askEverySite } from '../sites/combinedRead'
import * as siteRuntimeStore from './siteRuntimeStore'

/** One site's position in the feed, keyed by the logical `SiteConfig.siteId`. */
type PerSiteCursors = Record<string, string>

export type MergedRunFeed = {
  runs: RunRow[]
  /** Null only when every site that answered is exhausted and none stayed silent. */
  nextCursor: string | null
  unanswered: SiteSilence[]
}

export type MergedRunFeedArgs = {
  limit: number
  cursor?: string
  /** What every site is asked for, besides the page size and its own position. */
  filter?: Omit<RunListPageParams, 'limit' | 'before'>
  /**
   * Narrows the rows to what this viewer may see, BEFORE the page is sliced —
   * so a row they may not see costs them a shorter page rather than a slot in
   * it. The rule itself stays in `runReadHelpers.ts`, where the queries share
   * it; this module only guarantees where it runs.
   */
  visible?: (runs: RunRow[]) => Promise<RunRow[]>
}

/** base64url of the JSON object, so a URL can carry it unescaped. Not a secret — see the header. */
export function encodeFeedCursor(per: PerSiteCursors): string {
  return Buffer.from(JSON.stringify(per), 'utf8').toString('base64url')
}

/**
 * `{}` for an absent cursor and for one that does not decode — the first page,
 * never a failure. Entries that are not strings are dropped rather than
 * trusted: this string came back from a browser, and a site must never be
 * handed a `before` it cannot read.
 */
export function decodeFeedCursor(cursor?: string): PerSiteCursors {
  if (!cursor) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const per: PerSiteCursors = {}
    for (const [siteId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length > 0) per[siteId] = value
    }
    return per
  } catch {
    return {}
  }
}

/**
 * `(runFeedKey, id)` descending — the same order each site applies, so merging
 * is a comparison and never a re-sort of something ordered differently.
 * `runFeedKey` is core's, deliberately: an order and a cursor that disagree
 * about the key silently skip rows. ISO strings in one format compare
 * chronologically, which is why the wire carries them that way.
 */
export function compareRunsNewestFirst(a: RunRow, b: RunRow): number {
  const ka = runFeedKey(a)
  const kb = runFeedKey(b)
  if (ka !== kb) return ka < kb ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/**
 * How far down the merged view is complete: the NEWEST bottom edge among the
 * sites whose window came back full. Null when every site that answered is
 * exhausted, which means the whole of what came back is complete.
 */
function horizonOf(answers: SiteAnswer<RunListPageResult>[]): RunRow | null {
  let horizon: RunRow | null = null
  for (const answer of answers) {
    if (answer.value.nextBefore === null) continue
    const edge = answer.value.runs.at(-1)
    if (!edge) continue
    if (!horizon || compareRunsNewestFirst(edge, horizon) < 0) horizon = edge
  }
  return horizon
}

export async function readMergedRunFeed(args: MergedRunFeedArgs): Promise<MergedRunFeed> {
  const previous = decodeFeedCursor(args.cursor)

  const read = await askEverySite((site) =>
    siteRuntimeStore.listRunsPage(site.siteId, {
      ...args.filter,
      limit: args.limit,
      before: previous[site.siteId],
    }),
  )

  const horizon = horizonOf(read.answers)
  const complete = read.answers
    .flatMap((answer) => answer.value.runs)
    .filter((run) => !horizon || compareRunsNewestFirst(run, horizon) <= 0)
    .sort(compareRunsNewestFirst)

  const shown = args.visible ? await args.visible(complete) : complete
  const shownIds = new Set(shown.map((run) => run.id))
  const page = complete.filter((run) => shownIds.has(run.id)).slice(0, args.limit)

  // Where each site is left standing. The tempting rule — advance only past the
  // rows this page SHOWED — cannot be made to work: a site whose whole answer
  // the viewer may not see would contribute nothing, keep its position, and be
  // asked for the same rows on every page for ever. So the line is the page's
  // last row when the page filled, and the horizon when it did not — because a
  // short page means the complete region ran out of rows to show, not that
  // there was nothing there. Everything a site returned at or above that line
  // goes behind its cursor; everything below stays in front, which is what the
  // tempting rule was protecting.
  const line = page.length >= args.limit ? page.at(-1) ?? null : horizon

  const next: PerSiteCursors = { ...previous }
  let mayHaveMore = read.unanswered.length > 0
  for (const answer of read.answers) {
    const rows = answer.value.runs
    const consumed = line ? rows.filter((run) => compareRunsNewestFirst(run, line) <= 0) : rows
    const oldestConsumed = consumed.at(-1)
    if (oldestConsumed) next[answer.siteId] = runPageCursor(oldestConsumed)
    if (consumed.length < rows.length || answer.value.nextBefore !== null) mayHaveMore = true
  }

  return {
    runs: page,
    nextCursor: mayHaveMore ? encodeFeedCursor(next) : null,
    unanswered: read.unanswered,
  }
}
