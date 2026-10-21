/**
 * Ask every site, under one deadline, and say what did not come back.
 *
 * The one thing every combined read in hq calls. Nothing domain-specific
 * lives here: a caller hands in the question to put to a site and gets back
 * the answers alongside the reasons for every silence. Six reads replacing the
 * old single-site helper independently is how five of them end up agreeing and
 * one does not.
 *
 * Three rules shape it:
 *
 * **A partial answer is acceptable; a partial answer presented as whole is
 * not.** This function never throws because a site failed, and never returns
 * answers without the silences beside them — `CombinedRead` is one object so a
 * caller cannot take the first and forget the second. Failing the whole view
 * because one site is asleep would take the dashboard away from the entire
 * organisation over one sleeping laptop.
 *
 * **The deadline is per site and the sites are asked in parallel**, so a read
 * of eight sites costs one deadline rather than eight. That is structural
 * here, not incidental: every site is dispatched before any is awaited.
 *
 * **A site the compatibility rule refuses is named, not asked.** One whose
 * recorded version is two or more majors from hq's, or that hq has refused, is
 * reported as `version` — an upgrade somebody can perform, naming which side —
 * rather than as an error nobody can act on. A site that answers
 * `unknown_method` is reported the same way.
 *
 * `eligibleSites.ts` decides which sites exist to ask; `siteSilence.ts`
 * decides what a site's failure means and what a person is told about it.
 */
import type { CombinedRead, SiteAnswer, SiteSilence } from '@agenthix/core'
import { DEFAULT_REQUEST_TIMEOUT_MS } from './channel/pendingRequests'
import { eligibleSites, type EligibleSite } from './eligibleSites'
import {
  classifyFailure,
  errorDetail,
  silenceFor,
  timeoutSilence,
  versionShortfall,
} from './siteSilence'
import { Logger } from '../server/utils/logger'

export type { EligibleSite } from './eligibleSites'

const logger = new Logger('CombinedRead')

const DEFAULT_COMBINED_READ_TIMEOUT_MS = 4000

/**
 * A site's deadline must stay strictly under the channel's own request
 * timeout, and this is where that is enforced.
 *
 * The whole offline-versus-slow distinction rests on it. A site with no
 * channel fails instantly, so it reports `offline`; a connected-but-slow site
 * has to hit THIS deadline, because if the channel's own timeout fires first
 * the answer arrives through a store — `workspaceStore`, `siteRuntimeStore` —
 * that collapses `timeout` into `SiteUnreachableError(reason: 'offline')`. The
 * person would then be told a connected site is "not connected to hq" and sent
 * to check a connection that is fine.
 *
 * `combinedRead.test.ts` pins the invariant; this clamp is what holds it when
 * an environment or a caller asks for more.
 */
const MAX_SITE_DEADLINE_MS = DEFAULT_REQUEST_TIMEOUT_MS - 1

/**
 * How long one site has to answer before the read goes on without it. Four
 * seconds is chosen against a person watching a dashboard: a view that takes
 * fifteen seconds to admit a site is asleep has already failed the person
 * waiting for it. Env-overridable for an installation whose sites sit behind a
 * slow link, within the bound above.
 */
export const COMBINED_READ_TIMEOUT_MS = sanitiseDeadline(
  Number(process.env.COMBINED_READ_TIMEOUT_MS ?? DEFAULT_COMBINED_READ_TIMEOUT_MS),
  DEFAULT_COMBINED_READ_TIMEOUT_MS,
  'COMBINED_READ_TIMEOUT_MS',
)

export type AskEverySiteOptions = {
  /** Per site, not for the read as a whole. Clamped below the channel's own timeout. */
  timeoutMs?: number
}

/**
 * Asks every site this organisation still has and merges what came back.
 *
 * Three things every caller needs to know:
 *
 * 1. **Do not derive a site count from the two arrays.** `answers.length +
 *    unanswered.length` can be short by any site revoked between the listing
 *    and the call — such a site is dropped rather than named, because naming
 *    it sends somebody to fix nothing.
 * 2. **Both arrays are in registration order**, so a merged view can render
 *    them without sorting and they will not reshuffle between reads.
 * 3. **A timed-out call leaves its channel request pending** on that site's
 *    connection for up to the channel's own deadline. Accepted deliberately:
 *    this read has given up on that site, and holding the whole view open for
 *    another eleven seconds to collect a reply nobody is waiting for is the
 *    worse trade. The orphaned request settles into nothing when it returns.
 *
 * Never throws because a site failed.
 */
export async function askEverySite<T>(
  call: (site: EligibleSite) => Promise<T>,
  opts: AskEverySiteOptions = {},
): Promise<CombinedRead<T>> {
  const timeoutMs = sanitiseDeadline(opts.timeoutMs ?? COMBINED_READ_TIMEOUT_MS, COMBINED_READ_TIMEOUT_MS, 'timeoutMs')

  const sites = await eligibleSites()

  // Dispatched before anything is awaited — this is what makes the whole read
  // cost one deadline. `allSettled` rather than `all` as a backstop: `askOne`
  // is written not to reject, and if it ever did, one site must still not take
  // the view down.
  const settled = await Promise.allSettled(sites.map((s) => askOne(s, call, timeoutMs)))

  const answers: SiteAnswer<T>[] = []
  const unanswered: SiteSilence[] = []
  settled.forEach((outcome, i) => {
    const site = sites[i]
    if (outcome.status === 'rejected') {
      unanswered.push(silenceFor(site, 'error', errorDetail(site, outcome.reason)))
      return
    }
    if (outcome.value.kind === 'answer') answers.push({ siteId: site.siteId, value: outcome.value.value })
    else if (outcome.value.kind === 'silence') unanswered.push(outcome.value.silence)
  })

  return { answers, unanswered }
}

type Outcome<T> = { kind: 'answer'; value: T } | { kind: 'silence'; silence: SiteSilence } | { kind: 'gone' }

async function askOne<T>(
  site: EligibleSite,
  call: (site: EligibleSite) => Promise<T>,
  timeoutMs: number,
): Promise<Outcome<T>> {
  const tooOld = versionShortfall(site)
  if (tooOld) return { kind: 'silence', silence: silenceFor(site, 'version', tooOld) }

  const timer = new Deadline(timeoutMs)
  try {
    const raced = await Promise.race([
      // Wrapped, not called bare: a `call` that throws synchronously must
      // become a rejected promise the race can see, not an exception that
      // escapes past the deadline and takes the whole read with it.
      (async () => ({ answered: true as const, value: await call(site) }))(),
      timer.promise,
    ])
    if (!raced.answered) return { kind: 'silence', silence: timeoutSilence(site, timeoutMs) }
    return { kind: 'answer', value: raced.value }
  } catch (err) {
    return classifyFailure(site, err, timeoutMs)
  } finally {
    timer.clear()
  }
}

/**
 * Keeps a deadline a real, positive number of milliseconds under the channel's
 * own timeout. A typo'd environment variable otherwise yields `NaN`, every
 * site is reported as having timed out in "NaN ms", and the read completes in
 * a millisecond looking like a fleet-wide outage.
 */
function sanitiseDeadline(requested: number, fallback: number, name: string): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    logger.warn(`${name} must be a positive number of milliseconds; got ${requested}. Using ${fallback}.`)
    return fallback
  }
  if (requested >= DEFAULT_REQUEST_TIMEOUT_MS) {
    logger.warn(
      `${name} (${requested}) must stay under the channel's own ${DEFAULT_REQUEST_TIMEOUT_MS} ms request timeout, ` +
        `or a slow site is reported as disconnected. Using ${MAX_SITE_DEADLINE_MS}.`,
    )
    return MAX_SITE_DEADLINE_MS
  }
  return requested
}

/** One timer per site, cleared whichever way the race settles — a combined read
 *  must not leave four pending timers behind for every site it asked. */
class Deadline {
  readonly promise: Promise<{ answered: false }>
  private handle: ReturnType<typeof setTimeout> | null = null

  constructor(ms: number) {
    this.promise = new Promise((resolve) => {
      this.handle = setTimeout(() => resolve({ answered: false }), ms)
      this.handle.unref?.()
    })
  }

  clear(): void {
    if (this.handle) clearTimeout(this.handle)
    this.handle = null
  }
}
