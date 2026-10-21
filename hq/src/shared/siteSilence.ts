/**
 * What a person is told when a view could not ask every Execution Site.
 *
 * The words live here rather than in the component that shows them, and the
 * reason is testable coverage: `@agenthix/ui` has no test runner, so a copy
 * rule written there is a rule nobody runs. A pure function — silences in,
 * lines out — is exercised by `__tests__/siteSilence.test.ts` in this app,
 * including the `timeout`, `version` and `error` cases a view is hard to drive
 * into. `UnansweredSitesNotice` in `ui` takes what this returns and decides
 * only how it looks.
 *
 * Whether the notice reaches the screen is tested per screen, by rendering the
 * hq view that shows it (the file explorer, the Activity panel and its session
 * view, the chat list). A page without such a test is a walkthrough check —
 * look at a view whose site is stopped and confirm the sentence is there.
 *
 * The rule the words exist to keep: a partial view must never read as a whole
 * one. "Nothing here" and "could not ask" are different facts and a person acts
 * differently on each, so a view that shows this must also stop showing its own
 * "nothing here" copy.
 */
import type { SiteSilence, SiteSilenceReason } from '@agenthix/core'

/**
 * How to read a site's silence at a glance, before the sentence explaining it.
 * The one thing `SiteSilence.detail` does not carry — it states the fact, this
 * characterises it.
 *
 * Exhaustive over the four reasons on purpose: a fifth added to core's
 * vocabulary fails to compile here rather than reaching a person as the word
 * `undefined`.
 */
const REASON_SUMMARY: Record<SiteSilenceReason, string> = {
  offline: 'asleep or unreachable',
  timeout: 'too slow to answer',
  version: 'out of date',
  error: 'failed this read',
}

export type UnansweredSiteLine = {
  siteId: string
  /** The site's label and how to read its silence — never its id or its address. */
  heading: string
  /** The sentence the server wrote for a person. Never an exception or a stack. */
  detail: string
}

export type UnansweredSitesCopy = {
  headline: string
  sites: UnansweredSiteLine[]
}

/**
 * `subject` names what the reader is short of, as the object of "missing
 * from": "this list", "these run figures". It is never made the subject of a
 * verb, so a caller cannot produce a sentence that disagrees with itself the
 * way "This list exclude one Execution Site" did.
 *
 * Returns null when every site answered, so a view has nothing to render and
 * cannot accidentally render an empty frame.
 */
export function unansweredSitesCopy(unanswered: SiteSilence[], subject: string): UnansweredSitesCopy | null {
  if (unanswered.length === 0) return null

  const one = unanswered.length === 1
  const count = one ? 'One Execution Site' : `${unanswered.length} Execution Sites`
  const holds = one ? 'What it holds' : 'What they hold'

  return {
    headline: `${count} could not be asked. ${holds} is missing from ${subject}.`,
    sites: unanswered.map((s) => ({
      siteId: s.siteId,
      heading: `${s.label} — ${REASON_SUMMARY[s.reason]}`,
      detail: s.detail,
    })),
  }
}

/**
 * The distinct site silences carried by a listing's rows, one per site, for a
 * listing whose rows each read a detail from their own site (the chat list's
 * previews, the Activity panel's latest runs). Rows the site answered for
 * carry none.
 */
export function silencesOfRows(rows: readonly { siteSilence?: SiteSilence | null }[]): SiteSilence[] {
  const bySite = new Map<string, SiteSilence>()
  for (const row of rows) {
    if (row.siteSilence && !bySite.has(row.siteSilence.siteId)) bySite.set(row.siteSilence.siteId, row.siteSilence)
  }
  return [...bySite.values()]
}

/**
 * What a person is told when a read that belongs to ONE site failed outright —
 * a folder listing, one session's activity. The server's 503 already names the
 * site in a sentence written for a person (`SiteUnreachableError`), so that
 * sentence is the detail. Null for any other failure, which is not a site
 * that could not be asked and must not be told as one.
 */
export function unreachableSiteCopy(error: unknown, subject: string): UnansweredSitesCopy | null {
  if (!isSiteUnreachable(error)) return null
  return {
    headline: `The Execution Site could not be asked. What it holds is missing from ${subject}.`,
    sites: [{ siteId: 'unreachable', heading: 'Asleep or unreachable', detail: (error as Error).message }],
  }
}

export function isSiteUnreachable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: unknown }).statusCode === 503
}
