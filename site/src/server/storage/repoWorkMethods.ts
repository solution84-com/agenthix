/**
 * What hq may ask this site to do with a repository in one of its own storage
 * locations (ADR-0051: a closed set of named methods, never a generic relay).
 * One function per `REPO_WORK_METHODS` entry, registered in
 * `../hq/channelMethods.ts`; the git itself is `../../storage/repoOps.ts`,
 * moved here from hq unchanged.
 *
 * ## Why the git runs here
 *
 * `core/src/protocol/repoWork.ts` carries the reasoning in full. In short: hq's
 * image never installed git, and git obeys the configuration of the directory
 * it runs in — which is a directory an agent can write. The command belongs on
 * the side that owns the disk.
 *
 * ## The token is borrowed, and it does not come back
 *
 * hq mints the installation token and sends it on the call. Nothing here
 * stores it, and no failure path here builds its own message: every one of
 * them goes through `./repoWorkRefusals.ts`, which owns both halves of that
 * rule — a refusal assembled from the method and the location alone, and a
 * redaction over anything git said before it reaches this site's log. Its
 * header has the reasoning.
 *
 * ## The site never asks who is calling
 *
 * Neither params shape carries a user id. hq checks that the caller may
 * administer this location's attachment before it asks; per ADR-0042 a site
 * holds no identity store and has nothing to re-derive that from.
 *
 * ## Params arrive as `unknown`
 *
 * hq is the only caller and it is trusted, but the JSON still comes off a
 * socket, so each function validates its own shape. The zod schemas are a
 * hand-written mirror of core's types and the `Exact` assertions below pin
 * them to it — and, as with the location methods, vitest transpiles those
 * assertions away, so `npx tsc --noEmit` is not optional for this module.
 */
import { z } from 'zod'
import {
  REPO_CONNECT_SITE_BUDGET_MS,
  REPO_WORK_METHODS,
  RepoWorkError,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type RepoConnectParams,
  type RepoConnectResult,
  type RepoStateParams,
  type RepoStateResult,
  type LocationRef as WireLocationRef,
} from '@agenthix/core'
import { getContentState, initAndPushRepo, linkAndPullRepo } from '../../storage/repoOps'
import { GitDeadline } from '../../storage/gitRunner'
import { detailFor, locationDirFor, parseParams, refuse, UNPARSED_LOCATION } from './repoWorkRefusals'

const locRefSchema = z
  .object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().nullish(),
    taskId: z.string().nullish(),
  })

/** Exported so the "no caller" property is a test the wire can fail, not a reading of this file. */
export const REPO_CONNECT_PARAMS_SHAPE = {
  loc: locRefSchema,
  direction: z.enum(['push', 'pull']),
  repoUrl: z.string().min(1),
  token: z.string().min(1),
}
export const REPO_STATE_PARAMS_SHAPE = { loc: locRefSchema }

const repoConnectParams = z.object(REPO_CONNECT_PARAMS_SHAPE)
const repoStateParams = z.object(REPO_STATE_PARAMS_SHAPE)

/**
 * Pinned against CORE's shapes, not this app's own — the same reason
 * `./locationFileMethods.ts` gives: the wire is core's declaration, and a
 * field added there would otherwise be silently dropped at runtime by these
 * schemas with everything still compiling. `LocationRef` itself is core's, via
 * `./paths.ts`'s re-export, so it is not among them.
 */
const _wireMirrorsCore: [
  Exact<z.infer<typeof locRefSchema>, WireLocationRef>,
  Exact<z.infer<typeof repoConnectParams>, RepoConnectParams>,
  Exact<z.infer<typeof repoStateParams>, RepoStateParams>,
] = [true, true, true]
void _wireMirrorsCore

/**
 * Is this location a git repository, and does it hold anything?
 *
 * No git binary is involved — it is a `.git` probe and a directory listing —
 * but it crosses with the rest of repository work rather than staying on hq,
 * because leaving it behind would keep one filesystem read of this site's disk
 * for no benefit.
 */
export async function repoState(params: unknown): Promise<RepoStateResult> {
  const method = REPO_WORK_METHODS.state
  const { loc } = parseParams(repoStateParams, params, method, UNPARSED_LOCATION)
  const dir = locationDirFor(loc, method)
  try {
    return await getContentState(dir)
  } catch (err) {
    // No token to redact against: this method is never given one.
    refuse(err, method, loc, '', null)
  }
}

/**
 * Attach a repository to a location: push the location's files up to it, or
 * pull it down into a location that must be empty.
 *
 * hq owns the GitHub side — creating the repository, parsing and rebuilding
 * the URL, minting the token — and two directions are what reaches the wire;
 * `init` and `adopt` are one direction here, for the reason core's
 * `RepoConnectDirection` gives.
 *
 * The emptiness rule is checked here as well as on hq, which is the same
 * belt-and-braces `location.seedFiles` applies to its bounds: a rule only the
 * receiver enforces is one hq discovers by being refused, and a rule only the
 * caller enforces is one a second caller forgets. `linkAndPullRepo` has its
 * own guard inside it too — that one is the git module's, kept as it moved,
 * and it cannot produce a coded refusal.
 */
export async function repoConnect(params: unknown): Promise<RepoConnectResult> {
  const method = REPO_WORK_METHODS.connect
  const { loc, direction, repoUrl, token } = parseParams(repoConnectParams, params, method, UNPARSED_LOCATION)
  const dir = locationDirFor(loc, method)
  try {
    // INSIDE the guard. `GitDeadline` throws on a budget that is not a finite
    // number, and constructed a line above it that plain `Error` crossed the
    // channel raw — the same escape from this vocabulary that the params parse
    // had, one function over.
    //
    // One deadline for the whole call, shorter than the one hq is holding, so
    // this site fails the call and says why rather than leaving hq to read a
    // silence as "unreachable" while git carries on writing here.
    const deadline = new GitDeadline(REPO_CONNECT_SITE_BUDGET_MS)
    if (direction === 'pull') {
      if ((await getContentState(dir)).hasFiles) {
        throw new RepoWorkError('has_files', detailFor('has_files', method, loc))
      }
      await linkAndPullRepo(dir, repoUrl, token, deadline)
    } else {
      await initAndPushRepo(dir, repoUrl, token, deadline)
    }
  } catch (err) {
    refuse(err, method, loc, token, direction)
  }
  return { connected: true }
}
