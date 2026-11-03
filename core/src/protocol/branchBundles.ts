/**
 * A branch sent between two sites as a Git bundle (live preview spec section 5, *On another site*), since site
 * protocol 1.12. A live preview on a site other than its workspace's cannot share the branch's copy, so:
 *
 * 1. **The branch goes there.** hq asks the workspace's site to make a bundle of the branch (or of `main`):
 *    `bundle.make`, run in the commit helper, written to the site's own data folder, never an agent's. The site answers
 *    its SHA-256 and size. hq signs a bundle ticket (`direction: 'toPreview'`, relay/appTickets.ts) and hands it to
 *    the relay (`relay.bundle`); the relay opens `bundle.read` on the source's line and `bundle.write`, duplex, on the
 *    destination's, and passes the bytes between them. The destination checks the size and the SHA-256 against the
 *    ticket's, keeps the bundle, and tells hq (`bundle.landed`). hq then opens the live preview there with a copy made
 *    from it (`livePreview.open`, copy kind `bundle`).
 * 2. **Each commit comes back.** While the live preview runs there, the branch's runs go to that site and work in its
 *    copy. When the branch moves there (`livePreview.branchMoved`), hq asks that site for a bundle of the new commits
 *    (`bundle.make` from the live preview, with what the workspace's repository already has as `prerequisites`),
 *    sends it back the same way (`direction: 'back'`), and asks the workspace's site to bring the branch back from it
 *    (`branch.bringBackBundle`): read in the commit helper, with hooks off and nothing of the bundle's trusted but its
 *    commits, writing only that branch's name, a rewritten history kept first as a backup branch, as `branch.bringBack`.
 *
 * Each site verifies the ticket itself as the end it is (`verifyRelayToken` with `side`) and takes it once by its
 * `jti`. A refusal or a broken stream leaves nothing at the destination. `bundle.drop` removes a bundle once used;
 * a site also drops any bundle older than `BUNDLE_KEEP_MS`.
 */
import { createJsonHeadReader, encodeJsonHead, type JsonHeadRead } from '../relay/streamHead.js'
import type { BranchBackResult, CommitId, WorkspaceRepoRef } from './branchWork.js'

export const BUNDLE_METHODS = {
  /** Control channel: make a bundle and answer its hash and size. */
  make: 'bundle.make',
  /** Control channel: remove a bundle; safe to ask twice. */
  drop: 'bundle.drop',
  /** Content, opened by a relay on the source's line: the bundle's bytes. */
  read: 'bundle.read',
  /** Content, opened duplex by a relay on the destination's line: the bundle's bytes, checked and kept. */
  write: 'bundle.write',
} as const

/** Control channel, on the workspace's site: bring a branch back from a bundle that came back. */
export const BRANCH_BRING_BACK_BUNDLE_METHOD = 'branch.bringBackBundle'

export const BUNDLE_EVENTS = {
  landed: 'bundle.landed',
} as const

/** The largest bundle a site makes or keeps; a larger branch cannot have a live preview on another site. */
export const BUNDLE_MAX_BYTES = 2 * 1024 * 1024 * 1024
/** How long a site keeps a bundle nobody dropped. */
export const BUNDLE_KEEP_MS = 60 * 60 * 1000
/** As the other Git work: the site's budget is the shorter. */
export const BUNDLE_WORK_TIMEOUT_MS: number = 300_000
export const BUNDLE_WORK_SITE_BUDGET_MS: number = 240_000

/**
 * What a bundle holds:
 * - `branch`: a branch of the workspace's repository, on the workspace's site;
 * - `main`: the workspace's `main`, on its site, for `main`'s live preview elsewhere;
 * - `livePreview`: the branch in a live preview's own copy, on the site it runs on, for its commits coming back.
 */
export type BundleSource =
  | { kind: 'branch'; workspace: WorkspaceRepoRef; branch: string }
  | { kind: 'main'; workspace: WorkspaceRepoRef }
  | { kind: 'livePreview'; livePreviewId: string }

/**
 * `bundleId` is hq's (a uuid). `prerequisites`: commits the destination already has, so the bundle holds only what
 * comes after them; empty for a whole branch.
 */
export type BundleMakeParams = { bundleId: string; source: BundleSource; prerequisites: CommitId[] }

export type BundleMakeResult =
  | { made: true; bundleId: string; head: CommitId; sha256: string; size: number }
  /** The source has nothing after the prerequisites. Nothing was made. */
  | { made: false; reason: 'nothing_new'; head: CommitId }
  /** Past `BUNDLE_MAX_BYTES`. Nothing was kept. */
  | { made: false; reason: 'too_large'; size: number }

export type BundleDropParams = { bundleId: string }
export type BundleDropResult = { dropped: boolean }

/** The bundle ticket, untouched. Never logged. */
export type BundleReadParams = { ticket: string }
export type BundleWriteParams = { ticket: string }

/**
 * `expectedPrevious` is the branch's tip in the workspace's repository as hq knows it, which the bundle's
 * prerequisites were taken from; null for a branch the repository does not have.
 */
export type BranchBringBackBundleParams = {
  workspace: WorkspaceRepoRef
  branch: string
  bundleId: string
  expectedPrevious: CommitId | null
}
/**
 * `moved_meanwhile`: the branch moved in the workspace's repository since the bundle was made. Nothing was changed;
 * hq makes a new bundle from the new tip.
 */
export type BranchBringBackBundleResult =
  | { brought: true; back: BranchBackResult }
  | { brought: false; reason: 'moved_meanwhile'; head: CommitId }

/**
 * Why an end refused or stopped a bundle:
 * - `ticket-invalid`, `ticket-expired`: as `verifyRelayToken` says;
 * - `ticket-used`: this end already took the ticket;
 * - `not-found`: the source has no such bundle (dropped, or past `BUNDLE_KEEP_MS`);
 * - `hash-mismatch`: the bytes that arrived are not the ticket's size and SHA-256;
 * - `too-large`: past `BUNDLE_MAX_BYTES`, or past the destination's free disk;
 * - `busy`, `failed`: as for files.
 */
export const BUNDLE_SERVE_REFUSALS = [
  'ticket-invalid', 'ticket-expired', 'ticket-used', 'not-found', 'hash-mismatch', 'too-large', 'busy', 'failed',
] as const
export type BundleServeRefusal = (typeof BUNDLE_SERVE_REFUSALS)[number]

export type BundleReadHead = { ok: true; size: number } | { ok: false; refusal: BundleServeRefusal }
export type BundleWriteHead = { ok: true; sha256: string; size: number } | { ok: false; refusal: BundleServeRefusal }

/** destination site → hq once a transfer ends, whatever the outcome: the bundle ticket's `jti`, its bundle and what the site did. */
export type BundleLandedEvent = { transferId: string; bundleId: string; result: BundleWriteHead; at: string }

const isRefusal = (v: unknown): v is BundleServeRefusal =>
  typeof v === 'string' && (BUNDLE_SERVE_REFUSALS as readonly string[]).includes(v)
const isSize = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function isBundleReadHead(v: unknown): v is BundleReadHead {
  if (!record(v)) return false
  return v.ok === true ? isSize(v.size) : v.ok === false && isRefusal(v.refusal)
}

export function isBundleWriteHead(v: unknown): v is BundleWriteHead {
  if (!record(v)) return false
  if (v.ok === false) return isRefusal(v.refusal)
  return v.ok === true && typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256) && isSize(v.size)
}

export function encodeBundleReadHead(head: BundleReadHead): Uint8Array {
  if (!isBundleReadHead(head)) throw new Error('Not a valid bundle read head')
  return encodeJsonHead(head)
}

export function encodeBundleWriteHead(head: BundleWriteHead): Uint8Array {
  if (!isBundleWriteHead(head)) throw new Error('Not a valid bundle write head')
  return encodeJsonHead(head)
}

export function createBundleReadHeadReader(): { push(chunk: Uint8Array): JsonHeadRead<BundleReadHead> } {
  return createJsonHeadReader(isBundleReadHead)
}

export function createBundleWriteHeadReader(): { push(chunk: Uint8Array): JsonHeadRead<BundleWriteHead> } {
  return createJsonHeadReader(isBundleWriteHead)
}
