/**
 * hq's bundle methods on the control channel (core's `branchBundles.ts`): making a bundle in the commit helper into
 * the site's own data folder, dropping one, and bringing a branch back into the workspace's repository from one that
 * came back. Their bytes cross relay lines (`bundleStreams.ts`), never the control channel.
 */
import { z } from 'zod'
import {
  BUNDLE_MAX_BYTES, BUNDLE_WORK_SITE_BUDGET_MS, RepoWorkError, WORKSPACE_OWNER_TYPES, isCommitId, isCopyId, isGitBranchName,
  type BranchBringBackBundleResult, type BundleDropResult, type BundleMakeResult, type LivePreviewAnswer,
} from '@agenthix/core'
import { describeWorkspace, inTurn, placeWorkspace } from '../../branches/branchCalls'
import { Logger } from '../../utils/logger'
import { copyPlaceOf, previewHelper } from '../livePreviewCopies'
import { changeLivePreview, livePreviewRow } from '../livePreviewStore'
import { MALFORMED, UNKNOWN, refuse } from '../livePreviewWords'
import { bundleFile, bundleSize, dropBundle, freshBundleDir, hashFile } from './bundleStore'

const logger = new Logger('bundles')

const workspace = z.object({
  ownerType: z.enum(WORKSPACE_OWNER_TYPES), ownerId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), workspaceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
}).strict()
const id = z.string().refine(isCopyId)
const commit = z.string().refine(isCommitId)
const branch = z.string().refine(isGitBranchName)
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('branch'), workspace, branch }).strict(),
  z.object({ kind: z.literal('main'), workspace }).strict(),
  z.object({ kind: z.literal('livePreview'), livePreviewId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict(),
])
const makeParams = z.object({ bundleId: id, source, prerequisites: z.array(commit).max(64) }).strict()
const dropParams = z.object({ bundleId: id }).strict()
const bringBackParams = z.object({ workspace, branch, bundleId: id, expectedPrevious: commit.nullable() }).strict()

type MakeAnswer = LivePreviewAnswer<{ result: BundleMakeResult }>

export async function bundleMake(params: unknown): Promise<MakeAnswer> {
  const parsed = makeParams.safeParse(params)
  if (!parsed.success) return MALFORMED
  const q = parsed.data
  const out = await freshBundleDir(q.bundleId)
  const base = { out: { dir: out }, network: false, timeoutMs: BUNDLE_WORK_SITE_BUDGET_MS }
  let answer
  let rowId: string | null = null
  if (q.source.kind === 'livePreview') {
    const row = await livePreviewRow(q.source.livePreviewId)
    if (!row) return UNKNOWN
    if (row.copyKind !== 'bundle') return refuse('noCopy', 'This live preview runs from the branch\'s own copy, which needs no bundle to come back. Nothing was changed.')
    rowId = row.id
    answer = await previewHelper(
      { ...base, workspaceId: row.workspaceId, copy: { dir: copyPlaceOf(row).hostDir, readOnly: true } },
      { op: 'bundleMake', kind: 'livePreview', branch: row.branch, prerequisites: q.prerequisites }, `bundle.make from live preview ${row.id}`,
    )
  } else {
    const src = q.source
    const placed = await placeWorkspace(src.workspace, 'bundle.make').catch(() => null)
    if (!placed) return refuse('noCopy', `This site holds no ${describeWorkspace(src.workspace)}. Nothing was changed.`)
    answer = await inTurn(placed.ref.workspaceId, () => previewHelper(
      { ...base, workspaceId: placed.ref.workspaceId, ws: { dir: placed.ws, readOnly: true } },
      { op: 'bundleMake', kind: src.kind, branch: src.kind === 'branch' ? src.branch : null, prerequisites: q.prerequisites },
      `bundle.make from ${describeWorkspace(src.workspace)}`,
    ))
  }
  if (!answer) {
    await dropBundle(q.bundleId)
    return refuse('noCopy', 'This site could not make the bundle; the reason is in its log. Nothing was changed.')
  }
  const head = String(answer.head)
  if (answer.nothing) {
    await dropBundle(q.bundleId)
    return { ok: true, result: { made: false, reason: 'nothing_new', head } }
  }
  const size = await bundleSize(q.bundleId)
  if (size === null) {
    await dropBundle(q.bundleId)
    return refuse('noCopy', 'The bundle was not where this site made it. Nothing was changed.')
  }
  if (size > BUNDLE_MAX_BYTES) {
    await dropBundle(q.bundleId)
    return { ok: true, result: { made: false, reason: 'too_large', size } }
  }
  const { sha256 } = await hashFile(bundleFile(q.bundleId))
  if (rowId) await changeLivePreview(rowId, cur => ({ row: cur ? { ...cur, pending: { ...(cur.pending ?? {}), bundledHead: head } } : null, result: null }))
  return { ok: true, result: { made: true, bundleId: q.bundleId, head, sha256, size } }
}

export async function bundleDrop(params: unknown): Promise<BundleDropResult> {
  const parsed = dropParams.safeParse(params)
  if (!parsed.success) throw new RepoWorkError('invalid', 'bundle.drop was called with parameters it does not accept. Nothing was changed.')
  return { dropped: await dropBundle(parsed.data.bundleId) }
}

/**
 * A branch's new commits from a live preview's own copy, brought back into the workspace's repository: read in the
 * commit helper with its own Git folder, writing only that branch's name, and only while the branch is where hq says.
 */
export async function branchBringBackBundle(params: unknown): Promise<BranchBringBackBundleResult> {
  const parsed = bringBackParams.safeParse(params)
  if (!parsed.success) throw new RepoWorkError('invalid', 'branch.bringBackBundle was called with parameters it does not accept. Nothing was changed.')
  const q = parsed.data
  const placed = await placeWorkspace(q.workspace, 'branch.bringBackBundle')
  if ((await bundleSize(q.bundleId)) === null) {
    throw new RepoWorkError('refused', `branch.bringBackBundle: this site holds no bundle ${q.bundleId}; HQ sends it again. Nothing was changed.`)
  }
  const answer = await inTurn(placed.ref.workspaceId, () => previewHelper(
    { workspaceId: placed.ref.workspaceId, ws: { dir: placed.ws, readOnly: false }, bundle: { file: bundleFile(q.bundleId) }, network: false, timeoutMs: BUNDLE_WORK_SITE_BUDGET_MS },
    { op: 'bringBackBundle', branch: q.branch, expectedPrevious: q.expectedPrevious, date: new Date().toISOString().slice(0, 10) },
    `branch.bringBackBundle for ${describeWorkspace(q.workspace)}`,
  ))
  if (!answer) {
    throw new RepoWorkError('git_failed', `branch.bringBackBundle failed for ${describeWorkspace(q.workspace)}; the reason is in this site's log. Nothing was changed.`)
  }
  if (answer.movedMeanwhile) return { brought: false, reason: 'moved_meanwhile', head: String(answer.head) }
  logger.info(`Branch ${q.branch} of ${describeWorkspace(q.workspace)} came back from bundle ${q.bundleId}.`)
  return {
    brought: true,
    back: {
      head: String(answer.head), previous: typeof answer.previous === 'string' ? answer.previous : null,
      moved: answer.moved === true, backup: typeof answer.backup === 'string' ? answer.backup : null,
    },
  }
}

