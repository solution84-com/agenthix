/**
 * What a read that has no single owner brings back.
 *
 * Most reads belong to one storage boundary, and a boundary sits on one site:
 * hq resolves the owner and asks that site, and a second site changes nothing.
 * The rest — dashboard statistics, the activity feed, the storage listing,
 * what is running now — belong to no owner at all. hq asks every site it may
 * ask and merges what comes back.
 *
 * hq keeps no copy of a site's data, so a total is read when it is asked for,
 * never remembered. That makes silence a first-class part of the answer: a
 * site that could not be asked, or did not reply, is NAMED rather than
 * dropped. "No runs" and "cannot ask" must never look the same, and a total is
 * only true of the sites listed beneath it.
 *
 * `answers` and `unanswered` are one object deliberately. Handing back a bare
 * array of answers is what lets a view show a partial figure as a whole one,
 * so the shape makes the omission impossible to take without also taking the
 * reason for it.
 *
 * Failing the whole read because one site is asleep is the wrong trade: one
 * sleeping laptop would take the dashboard away from the entire organisation,
 * and the more sites an organisation runs the more often nothing would work.
 *
 * Type aliases rather than interfaces, as elsewhere in this directory: these
 * cross a Wasp operation's superjson `Payload`, which needs an implicit index
 * signature an interface does not have.
 */

/**
 * Why a site's figures are missing from a total. Four reasons, kept apart on
 * purpose — the difference between them is the difference between what a
 * person should go and do:
 *
 * - `offline` — the site has no open channel to hq. It is asleep, stopped, or
 *   has not connected since it registered.
 * - `timeout` — the site is connected and did not answer inside the wait. A
 *   slow site and a down one are different problems and are shown differently.
 * - `version` — the site runs a protocol this read cannot use. It is still
 *   part of the organisation; an upgrade is the action that fixes it, which is
 *   why `detail` names the version it runs.
 * - `error` — the site answered, and the answer was a failure.
 *
 * A REVOKED site has no reason here at all. It is not part of the
 * organisation any more, so it is neither asked nor named: telling somebody
 * "this site did not reply" about a site they deliberately revoked sends them
 * to fix nothing.
 */
export type SiteSilenceReason = 'offline' | 'timeout' | 'version' | 'error'

export type SiteSilence = {
  siteId: string
  /** The site's own label. A view names a site by this, never by its id or its address. */
  label: string
  reason: SiteSilenceReason
  /**
   * Why, in prose, for a person to read. Never a raw exception, never a stack,
   * and never a site's address or internal id where its label will do.
   */
  detail: string
}

export type SiteAnswer<T> = { siteId: string; value: T }

export type CombinedRead<T> = {
  answers: SiteAnswer<T>[]
  unanswered: SiteSilence[]
}
