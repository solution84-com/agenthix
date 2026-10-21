/**
 * Connecting a repository to a storage location, and reading whether one is
 * already there (ADR-0051: a closed set of named methods, never a generic
 * relay). The contract between hq's typed caller
 * (`hq/src/storage/repoWorkStore.ts`) and site's handlers
 * (`site/src/server/storage/repoWorkMethods.ts`), which run git over the
 * site's own disk through `site/src/storage/repoOps.ts`.
 *
 * ## Why git runs on the site
 *
 * Two reasons, and the second is the stronger one. hq's image installs no git
 * at all, so every one of these invocations already failed in a container
 * deployment of hq — they worked only where hq ran from a developer's host.
 * And git obeys the configuration of the DIRECTORY it runs in: hooks, filters
 * that run during `git add`, and settings that send a push and its token to
 * another host. That directory is one an agent can write. Passing settings on
 * each invocation stops some of that and not the rest; running the command on
 * the side that owns the disk is what contains it.
 *
 * The working-tree probe crosses with them even though it needs no binary.
 * Leaving it on hq would keep one filesystem read of a site's disk for no
 * benefit.
 *
 * ## The token is hq's, borrowed for one call
 *
 * hq mints or fetches the installation token and passes it in
 * `RepoConnectParams`. The site uses it for that one operation and stores
 * nothing — it has no credential of its own to resolve and, per ADR-0042, no
 * identity store to resolve one from. That makes `token` the most dangerous
 * field on this wire, and it travels in one direction only: **nothing coming
 * back may carry it**, not a result, not a refusal, not a log line on the
 * site. git quotes the command it ran when it fails, and a remote can be
 * written with a credential in it, so the site scrubs rather than trusting
 * that this codebase never builds such a URL.
 *
 * ## Who checks what
 *
 * hq checks entitlement — that the person may administer this location's
 * attachment — before it asks, and it owns the GitHub side: creating the
 * repository, parsing and rebuilding the URL, minting the token. The site
 * derives the location's directory and runs git in it. The site never asks
 * who is calling; `RepoConnectParams` and `RepoStateParams` carry no user id.
 *
 * ## What a refusal may say
 *
 * A code, and prose naming the method and the location by hq's own ids.
 * NEVER a path on the site's disk, and never git's raw output, which is full
 * of both absolute paths and whatever the remote chose to echo back. The
 * site logs that output locally, token-scrubbed, for an operator standing in
 * front of the machine that ran the command.
 */
import type { LocationRef } from '../storage/locationRef.js'

export const REPO_WORK_METHODS = {
  /** Control channel: attach an existing repository, or push a new one up. */
  connect: 'repo.connect',
  /** Control channel: is this location a git repository, and does it have files. */
  state: 'repo.state',
} as const

export type RepoWorkMethod = (typeof REPO_WORK_METHODS)[keyof typeof REPO_WORK_METHODS]

/**
 * Which way the content moves, and therefore which side is the source of
 * truth.
 *
 * `push` — the location's files are the truth, and they go up to a repository
 * hq has just created or already owns. `pull` — the repository is the truth
 * and it comes down into a location that must be empty.
 *
 * hq's own three modes are `init`, `adopt` and `link`. The first two differ
 * only in how hq obtains the repository URL, which happens before this call
 * and on hq, so the wire carries two directions rather than three modes: a
 * site given `init` and `adopt` would have to be told they mean the same
 * thing, and the day they stopped meaning it the site would be wrong.
 */
export type RepoConnectDirection = 'push' | 'pull'

/**
 * How long hq waits for `repo.connect`, and how long the site gives the git it
 * runs. **Two numbers, and their ORDER is the contract** — which is why both
 * live here rather than one in each app.
 *
 * The control channel has no cancel frame. When hq's request times out it
 * rejects the caller and forgets the request; the site hears nothing, and any
 * process it started keeps running — writing into a location's files that hq
 * has already reported as failed, that a retry will run a second git in, and
 * that a later run will mount. An abandoned operation reaching a later run is
 * the real cost, and it is worse than a plain failure.
 *
 * So the SITE is the side that enforces the deadline. Its budget is strictly
 * shorter than hq's, leaving room for the round trip and for the site to kill
 * what it started and confirm it is gone. hq's timer then exists only as a
 * backstop for a site that has stopped answering altogether — in which case
 * "unreachable" is the true diagnosis rather than a guess.
 *
 * `core/src/protocol/__tests__/repoWork.test.ts` pins the inequality, because
 * raising the site's budget past hq's would silently restore the abandonment
 * this ordering exists to prevent.
 *
 * Annotated `: number` rather than left as literal types. They are durations,
 * not discriminants, and a literal type makes a caller's `number` unassignable
 * — which showed up first as a test unable to stand one of them in for
 * another, and would show up next as an arithmetic result that will not fit.
 */
export const REPO_CONNECT_TIMEOUT_MS: number = 120_000
export const REPO_CONNECT_SITE_BUDGET_MS: number = 90_000

export interface RepoConnectParams {
  loc: LocationRef
  direction: RepoConnectDirection
  /** Always an `https://github.com/<owner>/<name>` URL, rebuilt by hq from the parsed parts. */
  repoUrl: string
  /** hq's installation token, for this one call. Never stored, never echoed. */
  token: string
}

/**
 * A literal rather than an empty object.
 *
 * The call either completed or refused, and there is nothing else to report —
 * but `{}` on the wire reads as "no answer yet" to anyone watching frames go
 * past, and a handler that forgot to return would produce it.
 */
export interface RepoConnectResult {
  connected: true
}

export interface RepoStateParams {
  loc: LocationRef
}

/** `hasFiles` ignores `.git`: a location holding only a repository has no files in it. */
export interface RepoStateResult {
  isGitRepo: boolean
  hasFiles: boolean
}

/**
 * Why a refusal needs a vocabulary of its own, and why it is a SECOND one
 * beside `LOCATION_FILE_ERROR_CODES`.
 *
 * A channel failure carries exactly one string, so any distinction hq needs
 * has nowhere to live but inside it. hq needs two in particular: a push the
 * remote rejected, which is what `adopt` must report as "that repository
 * already has content" rather than as a fault, and a site with no git binary,
 * which is an operator's problem and not a caller's.
 *
 * Neither belongs in the location-file vocabulary. Those codes are about a
 * path inside a location; these are about a command and a remote, and folding
 * them together would give every file read two codes it can never raise.
 */
export const REPO_WORK_ERROR_CODES = [
  /** The location named in the call cannot be resolved to a directory under this site's root. */
  'outside',
  /** Pulling a repository down into a location that already has files would overwrite them. */
  'has_files',
  /** The remote refused the push — the repository already has content that would be lost. */
  'push_rejected',
  /** This site has no git binary. Nothing the caller can fix. */
  'git_missing',
  /**
   * The call ran out of its budget. The site killed the git it had started and
   * CONFIRMED with the kernel that it was gone, so this says "nothing is still
   * running", which a channel timeout could not.
   */
  'git_timeout',
  /**
   * The budget ran out, the site tried to stop git, and the kernel would not
   * confirm it had gone.
   *
   * Its own code rather than a variant of `git_timeout`, because the two say
   * opposite things about the location: one that nothing is writing to it, the
   * other that something may be. Folded together, the single case where work
   * IS still in flight would be reported as the case where it is not — and
   * whoever had to go and look would have no reason to.
   */
  'git_abandoned',
  /**
   * The site's own process may not read or write in the location. The same
   * word `LOCATION_FILE_ERROR_CODES` uses, with the same meaning — an
   * unreadable directory reported as an empty one is the failure nobody finds
   * out about.
   */
  'refused',
  /** The call's parameters are not a shape this method accepts. hq's bug, or a version skew. */
  'invalid',
  /** git ran and failed. The reason is in the site's own log, not in this message. */
  'git_failed',
] as const

export type RepoWorkErrorCode = (typeof REPO_WORK_ERROR_CODES)[number]

/**
 * What says "this string was encoded by us". Its own marker rather than the
 * location-file one, for the same reason the codes are their own list: a
 * decoder that accepted either would hand a caller a code from a vocabulary
 * it is not checking against.
 */
export const REPO_WORK_ERROR_MARKER = 'repo-work/'

/** `<marker><code>: <detail>`. Only the FIRST colon separates, so a detail may hold one. */
const ENCODED_ERROR = /^([a-z_]+): ([\s\S]*)$/

export function encodeRepoWorkError(code: RepoWorkErrorCode, detail: string): string {
  return `${REPO_WORK_ERROR_MARKER}${code}: ${detail}`
}

/**
 * Null for anything that is not one of ours — a message from another handler,
 * a raw git error, a transport failure, or prose that merely opens with one
 * of these words. Never a partial guess: the marker must be there AND the
 * prefix behind it must be a published code.
 */
export function decodeRepoWorkError(wire: string): { code: RepoWorkErrorCode; message: string } | null {
  if (typeof wire !== 'string' || !wire.startsWith(REPO_WORK_ERROR_MARKER)) return null
  const match = ENCODED_ERROR.exec(wire.slice(REPO_WORK_ERROR_MARKER.length))
  if (!match) return null
  const code = match[1] as RepoWorkErrorCode
  if (!(REPO_WORK_ERROR_CODES as readonly string[]).includes(code)) return null
  return { code, message: match[2] }
}

/**
 * One class for both apps rather than one each. The site raises it, hq
 * rebuilds it from the wire, and neither can drift from the other's idea of
 * what the codes mean.
 */
export class RepoWorkError extends Error {
  constructor(readonly code: RepoWorkErrorCode, readonly detail: string) {
    super(encodeRepoWorkError(code, detail))
    this.name = 'RepoWorkError'
  }

  /** Rebuild from the single string a channel failure carries. */
  static fromWire(wire: string): RepoWorkError | null {
    const decoded = decodeRepoWorkError(wire)
    return decoded ? new RepoWorkError(decoded.code, decoded.message) : null
  }
}
