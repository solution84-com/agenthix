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
  type WorkspaceRepoRef,
  type LocationRef as WireLocationRef,
} from '@agenthix/core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getContentState, initAndPushRepo, linkAndPullRepo } from '../../storage/repoOps'
import { GitDeadline } from '../../storage/gitRunner'
import { inDir } from '../../agents/runtime/safeTree'
import { removeEntryIn } from '../../agents/runtime/homeFolder'
import { Logger } from '../utils/logger'
import { inTurn } from '../branches/branchCalls'
import {
  copyEntriesInto, copyIntoBoundaryFolder, copyOutOfBoundary, CopyRefused, namesInBoundaryFolder, withBoundaryFolder,
} from './boundaryTreeCopy'
import { AlreadyRepository, becomeRepository, isCodeWorkspace, withCodeWorkFolder } from './codeSpace'
import { getCodeDir, ownerDir } from './paths'
import { detailFor, locationDirFor, parseParams, refuse, UNPARSED_LOCATION } from './repoWorkRefusals'

const logger = new Logger('repoWork')

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
 * Where repository work on a location happens (adr-0173). A workspace's repository is its `main` in the code space,
 * a folder no container can write: a workspace that is not one yet becomes one there (`codeSpace.ts`). Any other
 * location (`files/`, a task's folder) stays in the boundary, as a backup rather than a codebase: its git work is done
 * in a copy of the site's own and only the result is put back, through open folders.
 */
type Place =
  | { kind: 'workspace'; ws: WorkspaceRepoRef }
  | { kind: 'folder'; boundary: string; rel: string }

function placeOf(loc: WireLocationRef, method: string): Place {
  const dir = locationDirFor(loc, method)
  if (loc.workspaceId && !loc.taskId) return { kind: 'workspace', ws: { ownerType: loc.ownerType, ownerId: loc.ownerId, workspaceId: loc.workspaceId } }
  const boundary = ownerDir(loc.ownerType, loc.ownerId)
  return { kind: 'folder', boundary, rel: path.relative(boundary, dir).split(path.sep).join('/') }
}

/** The state of a boundary folder, read through open folders: is there a `.git`, and anything else. */
async function folderState(boundary: string, rel: string): Promise<RepoStateResult> {
  const names = (await namesInBoundaryFolder(boundary, rel)) ?? []
  return { isGitRepo: names.includes('.git'), hasFiles: names.some(n => n !== '.git') }
}

/**
 * Is this location a git repository, and does it hold anything?
 *
 * No git binary is involved — a `.git` probe and a directory listing. A workspace answers from its `main` in the code
 * space when it has one, and otherwise from its folder in the boundary, which is not a repository whatever it holds.
 */
export async function repoState(params: unknown): Promise<RepoStateResult> {
  const method = REPO_WORK_METHODS.state
  const { loc } = parseParams(repoStateParams, params, method, UNPARSED_LOCATION)
  const place = placeOf(loc, method)
  try {
    if (place.kind === 'folder') return await folderState(place.boundary, place.rel)
    if (await isCodeWorkspace(place.ws)) return await getContentState(getCodeDir(place.ws))
    const boundary = ownerDir(place.ws.ownerType, place.ws.ownerId)
    return { isGitRepo: false, hasFiles: (await folderState(boundary, `workspaces/${place.ws.workspaceId}`)).hasFiles }
  } catch (err) {
    // No token to redact against: this method is never given one.
    refuse(asRefusal(err, method, loc), method, loc, '', null)
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
 * The emptiness rule is checked here as well as on hq: a rule only the
 * receiver enforces is one hq discovers by being refused, and a rule only the
 * caller enforces is one a second caller forgets.
 */
export async function repoConnect(params: unknown): Promise<RepoConnectResult> {
  const method = REPO_WORK_METHODS.connect
  const { loc, direction, repoUrl, token } = parseParams(repoConnectParams, params, method, UNPARSED_LOCATION)
  const place = placeOf(loc, method)
  try {
    // INSIDE the guard: `GitDeadline` throws on a budget that is not a finite number. One deadline for the whole
    // call, shorter than the one hq is holding, so this site fails the call and says why.
    const deadline = new GitDeadline(REPO_CONNECT_SITE_BUDGET_MS)
    const hasFiles = () => { throw new RepoWorkError('has_files', detailFor('has_files', method, loc)) }
    if (place.kind === 'workspace') {
      await inTurn(place.ws.workspaceId, () => connectWorkspace(place.ws, direction, repoUrl, token, deadline, hasFiles))
    } else if (direction === 'pull') {
      if ((await folderState(place.boundary, place.rel)).hasFiles) hasFiles()
      await pullIntoFolder(place.boundary, place.rel, repoUrl, token, deadline)
    } else {
      await backUpFolder(place.boundary, place.rel, repoUrl, token, deadline)
    }
  } catch (err) {
    refuse(asRefusal(err, method, loc), method, loc, token, direction)
  }
  return { connected: true }
}

async function connectWorkspace(
  ws: WorkspaceRepoRef, direction: 'push' | 'pull', repoUrl: string, token: string, deadline: GitDeadline, hasFiles: () => never,
): Promise<void> {
  const main = getCodeDir(ws)
  if (await isCodeWorkspace(ws)) {
    if (direction === 'pull') {
      if ((await getContentState(main)).hasFiles) hasFiles()
      return linkAndPullRepo(main, repoUrl, token, deadline)
    }
    return initAndPushRepo(main, repoUrl, token, deadline)
  }
  if (direction === 'pull') {
    const boundary = ownerDir(ws.ownerType, ws.ownerId)
    if ((await folderState(boundary, `workspaces/${ws.workspaceId}`)).hasFiles) hasFiles()
    await becomeRepository(ws, 'empty', dir => linkAndPullRepo(dir, repoUrl, token, deadline))
    return
  }
  await becomeRepository(ws, 'files', dir => initAndPushRepo(dir, repoUrl, token, deadline))
}

/**
 * Pulls a repository into an empty boundary folder: pulled into a folder of the site's own, then written into the
 * boundary folder through open folders. A `.git` left there with no files is replaced.
 */
async function pullIntoFolder(boundary: string, rel: string, repoUrl: string, token: string, deadline: GitDeadline): Promise<void> {
  await withCodeWorkFolder(async work => {
    const repo = path.join(work, 'repo')
    await fs.mkdir(repo)
    await linkAndPullRepo(repo, repoUrl, token, deadline)
    await withBoundaryFolder(boundary, rel, async dir => {
      await removeEntryIn(dir, '.git')
      await copyEntriesInto(repo, dir)
    })
  })
}

/**
 * Backs a boundary folder up to GitHub (adr-0173, the one exception): the folder stays where it is, shared and
 * writable. The first push is made from a copy of the site's own, taken without following a symlink; then the
 * finished `.git` is written into the folder through open folders, beside it first and renamed into place. The site
 * never commits or pushes in the folder itself.
 */
async function backUpFolder(boundary: string, rel: string, repoUrl: string, token: string, deadline: GitDeadline): Promise<void> {
  await withCodeWorkFolder(async work => {
    const repo = path.join(work, 'repo')
    await copyOutOfBoundary(boundary, rel, repo)
    await initAndPushRepo(repo, repoUrl, token, deadline)
    await withBoundaryFolder(boundary, rel, async dir => {
      const incoming = `.git.incoming-${randomUUID()}`
      try {
        await copyIntoBoundaryFolder(path.join(repo, '.git'), dir, incoming)
        await removeEntryIn(dir, '.git')
        await fs.rename(inDir(dir, incoming), inDir(dir, '.git'))
      } finally {
        await removeEntryIn(dir, incoming).catch(() => {})
      }
    })
  })
}

/** A copy refused for what a run left in the location is the location refusing the work; the rest goes on as it is. */
function asRefusal(err: unknown, method: string, loc: WireLocationRef): unknown {
  if (err instanceof CopyRefused || err instanceof AlreadyRepository) {
    logger.error(`${method} for ${loc.ownerType} ${loc.ownerId}: ${err.message}`)
    return new RepoWorkError('refused', detailFor('refused', method, loc))
  }
  return err
}
