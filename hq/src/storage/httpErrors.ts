/**
 * Shared mapping from workspaceStore's `SiteUnreachableError` to an HTTP
 * response — every action/query boundary that reads through the store needs
 * the same translation (plan 5c task 12 review, IMPORTANT 4), and duplicating
 * the `instanceof` check at each call site is how one of them drifts.
 */
import { HttpError } from 'wasp/server'
import { LocationFileError, RepoWorkError, type LocationFileErrorCode, type RepoWorkErrorCode } from '@agenthix/core'
import { SiteUnreachableError } from './workspaceStore'
import { AgentPackageMissingError, SystemPackageMissingError } from '../packages/runPackages'
import { PackageDeliveryError } from '../packages/packageDelivery'
import { PackageNotFoundError } from '../packages/packageStore'

/**
 * Rethrows a `SiteUnreachableError` as `HttpError(503, ...)`; anything else —
 * including an `HttpError` the same try block already threw itself (e.g. a
 * 404 "not found") — propagates completely unchanged. This is the narrow
 * mapping most boundaries want: one specific failure mode translated, nothing
 * else reinterpreted.
 */
export function rethrowSiteUnreachableAsHttp(err: unknown): never {
  if (err instanceof SiteUnreachableError) throw new HttpError(503, err.message)
  throw err
}

/**
 * The broader mapping `connectRepoAction`/`disconnectRepoAction` use: a
 * `SiteUnreachableError` still becomes 503 first, but anything else — GitHub/git
 * errors with no `HttpError` of their own — gets wrapped rather than surfacing
 * as a raw 500. Do NOT use this at a boundary that already throws its own typed
 * `HttpError` (e.g. a 404) inside the same try — it would reinterpret that as a
 * generic 400; use `rethrowSiteUnreachableAsHttp` there instead.
 */
export function asHttp(err: unknown): HttpError {
  if (err instanceof SiteUnreachableError) return new HttpError(503, err.message)
  // Before the generic wrap below: a site's coded refusal already knows what
  // it is, and a rejected push reported as a 400 "repo-work/push_rejected: …"
  // would show a person the wire encoding instead of the sentence.
  if (err instanceof RepoWorkError) return new HttpError(REPO_WORK_STATUS[err.code], err.detail)
  const msg = err instanceof Error ? err.message : 'Something went wrong'
  if (/not configured|authentication failed/i.test(msg)) return new HttpError(422, msg)
  return new HttpError(400, msg)
}

/**
 * The boundary a chat-send or a prompt-preview reaches when `buildContext`
 * (or the delivery it triggers) fails before a run's dispatch — every one of
 * these is a person-actionable conflict, not a server fault: the agent has
 * no content yet (`AgentPackageMissingError`), a system package hq is
 * supposed to write itself hasn't been yet (`SystemPackageMissingError`), the
 * content a run named is no longer held by hq, long after the package moved on
 * (`PackageNotFoundError`), or the site couldn't be brought up to date
 * (`PackageDeliveryError` — its message names the reason, which must reach
 * the person, not just a log line). Delegates to
 * `rethrowSiteUnreachableAsHttp` for everything else, so the two mappings
 * combine without duplicating that one's rule.
 */
export function rethrowDispatchErrorAsHttp(err: unknown): never {
  if (
    err instanceof AgentPackageMissingError ||
    err instanceof SystemPackageMissingError ||
    err instanceof PackageNotFoundError ||
    err instanceof PackageDeliveryError
  ) {
    throw new HttpError(409, err.message)
  }
  rethrowSiteUnreachableAsHttp(err)
}

/**
 * What a site's refusal about one of its files means to the person who asked.
 *
 * A containment refusal, a missing file, a payload over a bound and a site
 * that cannot answer are four different things, and left unmapped every one of
 * them surfaced as a 500 — a fault report for a decision the site made
 * correctly.
 *
 * Typed `Record<LocationFileErrorCode, number>` deliberately: a code added to
 * core's vocabulary fails to compile here rather than falling through to a
 * default nobody chose.
 */
const LOCATION_FILE_STATUS: Record<LocationFileErrorCode, number> = {
  // The caller is entitled to the location; the path they named is not in it.
  outside: 403,
  not_found: 404,
  exists: 409,
  not_a_file: 400,
  not_a_directory: 400,
  // The site's own process may not read there. Nothing the caller can fix, and
  // not hq's fault either — the failure is upstream of both.
  refused: 502,
  too_large: 413,
  too_many: 413,
  // Mid-operation the stream or the connection went away: the site is there,
  // this attempt is not finishable, and trying again is the right advice.
  cancelled: 503,
  // hq sent a shape the site does not accept: hq's own bug, or a version skew
  // between the two. A person can do nothing with it, and it is not the site's
  // failure to report as one — the same status its repository-work counterpart
  // gets, for the same reason.
  invalid: 500,
  failed: 502,
}

/**
 * The boundary every read of a location's files reaches. Everything but a
 * site's coded refusal delegates to `rethrowSiteUnreachableAsHttp`, so the
 * unreachable rule is stated once.
 */
export function rethrowLocationFileErrorAsHttp(err: unknown): never {
  // `detail`, not `message`: the message carries the wire marker that encodes
  // the code, which is for hq to read and not for a person.
  if (err instanceof LocationFileError) throw new HttpError(LOCATION_FILE_STATUS[err.code], err.detail)
  rethrowSiteUnreachableAsHttp(err)
}

/**
 * What a site's refusal about repository work means to the person who asked.
 *
 * Typed `Record<RepoWorkErrorCode, number>` deliberately: a code added to
 * core's vocabulary fails to compile here rather than falling through to a
 * default nobody chose — the same rule `LOCATION_FILE_STATUS` follows.
 */
const REPO_WORK_STATUS: Record<RepoWorkErrorCode, number> = {
  // The caller is entitled to the location; the location cannot be placed.
  outside: 400,
  // Both are states of the world the person can resolve, not faults.
  has_files: 409,
  push_rejected: 409,
  // The site's own machine cannot do this. Upstream of both the caller and hq.
  git_missing: 502,
  git_failed: 502,
  // The site ran out of ITS budget and stopped what it started. 504 rather
  // than 502 because retrying is the right advice, and rather than 503
  // because the site is answering — it is the operation that did not fit.
  git_timeout: 504,
  // The same deadline, the opposite fact: something may still be running on
  // the site. NOT 504 beside its sibling — retrying is precisely the wrong
  // advice while an unstopped git may be writing to the same location, and 502
  // says the failure is upstream and needs looking at rather than repeating.
  git_abandoned: 502,
  // The site's own process may not read or write there. Nothing the caller can
  // fix, and not hq's fault either — the same status its location-file
  // counterpart gets, for the same reason.
  refused: 502,
  // hq sent a shape the site does not accept: hq's own bug, or a version skew
  // between the two. A person can do nothing with it, and it is not the site's
  // failure to report as one.
  invalid: 500,
}

/**
 * The boundary every repository-work call reaches. Everything but a site's
 * coded refusal delegates to `rethrowSiteUnreachableAsHttp`, so the
 * unreachable rule is stated once.
 */
export function rethrowRepoWorkErrorAsHttp(err: unknown): never {
  // `detail`, not `message`: the message carries the wire marker that encodes
  // the code, which is for hq to read and not for a person.
  if (err instanceof RepoWorkError) throw new HttpError(REPO_WORK_STATUS[err.code], err.detail)
  rethrowSiteUnreachableAsHttp(err)
}
