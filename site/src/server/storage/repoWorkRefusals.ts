/**
 * What a repository-work failure becomes, and what it is allowed to say.
 *
 * Split out of `./repoWorkMethods.ts`, which was carrying two jobs — this one
 * and the two channel methods themselves — the same split
 * `./locationContainment.ts` makes for the file methods and for the same
 * reason.
 *
 * ## The token goes out and does not come back
 *
 * hq mints an installation token, sends it on the call, and the site borrows
 * it for that one operation. Everything on the way back is built here, and
 * two separate mechanisms keep the token out of it:
 *
 *  - **Structural.** A refusal's text comes from `detailFor` alone — the
 *    method, the location by hq's own ids, and a fixed sentence. git's output
 *    is never a component of it, so there is nothing to scrub on the wire.
 *  - **Scrubbed.** The site's OWN log does carry git's output, because an
 *    operator in front of that machine needs it — and git quotes the command
 *    it ran, which can be a URL with a credential in it. So `redactToken`
 *    runs over that text before the logger sees it.
 *
 * The order in `refuse` is load-bearing: redact, then log, then raise. A log
 * line written before the redaction is exactly the leak this module exists to
 * prevent, and it would be the copy nobody reviews.
 *
 * ## What a refusal may say
 *
 * A code, and prose naming the method and the location by hq's own ids —
 * `describeLocation`, the rule `./locationContainment.ts` states. Never a path
 * on this site's disk, and never git's raw output, which is full of both those
 * paths and whatever the remote echoed back.
 */
import { ZodError } from 'zod'
import { RepoWorkError, type RepoConnectDirection, type RepoWorkErrorCode } from '@agenthix/core'
import { GitCommandFailed, GitMissing, GitTimedOut } from '../../storage/gitRunner'
import { describeLocation } from './locationContainment'
import { locationDir, type LocationRef } from './paths'
import { Logger } from '../utils/logger'

const logger = new Logger('repo')

/**
 * Replace every occurrence of the token with a marker.
 *
 * A plain string scan rather than a regular expression: a token is an opaque
 * value from GitHub and building a pattern out of it would need escaping to be
 * right, which is one more thing that can be wrong in the one place that must
 * not be. An empty token matches everything and is treated as nothing to do.
 *
 * Exported for its own test — this is the function the no-leak property rests
 * on, so it is asserted directly as well as through the failure paths.
 */
export function redactToken(text: string, token: string): string {
  if (!token) return text
  return text.split(token).join('<redacted>')
}

/** What the runner's three failure classes said, for the log and for the match below. */
function gitOutputOf(err: GitCommandFailed | GitTimedOut): string {
  return [err.message, err.stdout, err.stderr].filter(Boolean).join('\n')
}

/**
 * The same patterns hq matched on before this crossed the channel, applied
 * where git's output still exists. hq now reads the CODE instead, so its
 * `adopt` message no longer depends on git's wording reaching it intact.
 */
const PUSH_REJECTED = /reject|non-fast-forward|fetch first|failed to push/i

/**
 * Which refusal a failure is, and what to put in this site's log.
 *
 * `direction` is required rather than optional: a fetch that fails because the
 * remote is unreachable says "fatal: could not read ... connection refused",
 * which the pattern above matches on the word `refused` — and answering a PULL
 * with "the repository already has content this push would overwrite" is a
 * sentence that is false in every part. A rejected push is only reachable
 * while pushing, so that is when the pattern is consulted.
 */
export function classify(
  err: unknown,
  direction: RepoConnectDirection | null,
): { code: RepoWorkErrorCode; text: string } {
  if (err instanceof GitMissing) return { code: 'git_missing', text: err.message }
  // The two outcomes of a deadline are different facts about the location, so
  // they are different codes. `confirmedDead` is the whole distinction.
  if (err instanceof GitTimedOut) {
    return { code: err.confirmedDead ? 'git_timeout' : 'git_abandoned', text: gitOutputOf(err) }
  }
  if (err instanceof GitCommandFailed) {
    const text = gitOutputOf(err)
    const rejected = direction === 'push' && PUSH_REJECTED.test(text)
    return { code: rejected ? 'push_rejected' : 'git_failed', text }
  }
  // Not from git at all: a filesystem error from the probe or the mkdir. The
  // errno decides, and its message carries an absolute path, so it goes to the
  // log and never into the refusal.
  const errno = (err as NodeJS.ErrnoException | null)?.code
  const text = err instanceof Error ? err.message : String(err)
  if (errno === 'EACCES' || errno === 'EPERM') return { code: 'refused', text }
  return { code: 'git_failed', text }
}

export function detailFor(code: RepoWorkErrorCode, method: string, loc: LocationRef): string {
  const where = describeLocation(loc)
  switch (code) {
    case 'outside':
      return `${method} cannot place ${where} inside this site's storage`
    case 'has_files':
      return `${method} would overwrite the files already in ${where} — link into an empty location, or push these up instead`
    case 'push_rejected':
      return `${method} could not push ${where}: the repository already has content this push would overwrite`
    case 'git_missing':
      return `${method} needs git on this Execution Site, and nothing on its PATH answers to that name`
    case 'git_timeout':
      return `${method} ran past this site's budget for ${where} and was stopped — nothing it started is still running`
    case 'git_abandoned':
      return (
        `${method} ran past this site's budget for ${where} and could NOT be confirmed stopped — ` +
        'a git process may still be writing to this location. Check the Execution Site before retrying'
      )
    case 'refused':
      return `${method} may not read or write in ${where} — the Execution Site's own process was refused there`
    case 'invalid':
      return `${method} was called with parameters it does not accept`
    case 'git_failed':
      return `${method} failed for ${where} — the reason stays in this site's log, because it names paths on this disk`
  }
}

/**
 * Turn whatever git did into a refusal hq can read, and put the rest in this
 * site's log.
 *
 * The order matters: redact first, then log, then raise. A log line written
 * before the redaction is exactly the leak this function exists to prevent,
 * and it would be the copy nobody reviews.
 */
export function refuse(
  err: unknown,
  method: string,
  loc: LocationRef,
  token: string,
  direction: RepoConnectDirection | null,
): never {
  if (err instanceof RepoWorkError) throw err
  const { code, text } = classify(err, direction)
  logger.error(`${method} for ${describeLocation(loc)}: ${redactToken(text, token)}`)
  // A deadline that could not be confirmed enforced is an operational problem
  // on this machine, not a slow git. It reaches hq as its own code — see
  // `classify` — and it also names the group here, because the pgid is the one
  // thing an operator needs and the one thing that may not cross to hq.
  if (err instanceof GitTimedOut && !err.confirmedDead) {
    logger.error(
      `${method} could not confirm that git process group ${err.pid ?? '(unknown)'} had gone — ` +
        'something may still be writing into this location',
    )
  }
  throw new RepoWorkError(code, detailFor(code, method, loc))
}

/**
 * The params, or a refusal that says so.
 *
 * `.parse()` belongs INSIDE the guard: left outside, a ZodError crosses the
 * channel raw, reaches hq as an unclassified failure, and a person is shown a
 * JSON blob of issues under a generic 400 instead of one of the statuses this
 * vocabulary exists to give.
 *
 * Only the issues' PATHS and CODES are logged, never zod's rendered message
 * and never the input. The params of a `repo.connect` contain the token, and
 * the one thing that must not happen on a path where validation failed is
 * reaching for a value to redact against.
 */
export function parseParams<T>(schema: { parse: (input: unknown) => T }, params: unknown, method: string, loc: LocationRef): T {
  try {
    return schema.parse(params)
  } catch (err) {
    const issues = err instanceof ZodError ? err.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.code}`) : []
    logger.error(`${method} was called with parameters it does not accept: ${issues.join(', ') || 'unknown'}`)
    throw new RepoWorkError('invalid', detailFor('invalid', method, loc))
  }
}

/**
 * The location a refusal may name when the params did not parse.
 *
 * Nothing is known about the call, so nothing is claimed about it: an owner
 * type and id that say "unparsed" rather than a shape borrowed from whatever
 * happened to be on the wire.
 */
export const UNPARSED_LOCATION: LocationRef = { ownerType: 'project', ownerId: '(unparsed)' }

/**
 * The location's own directory, with its own refusal.
 *
 * `locationDir` runs `assertSafeId`, whose message echoes the rejected id raw
 * and would carry this site's storage root besides — the same reason
 * `locationContainment.baseDir` exists for the file methods. There is no
 * relative path to contain here: the location IS the target, so resolution is
 * the whole of the check.
 */
export function locationDirFor(loc: LocationRef, method: string): string {
  try {
    return locationDir(loc)
  } catch {
    throw new RepoWorkError('outside', detailFor('outside', method, loc))
  }
}
