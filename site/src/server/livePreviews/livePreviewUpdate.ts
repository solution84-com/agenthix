/**
 * `update_from_main` for a run working in a live preview's own copy on this site (copy kind `bundle`): `main` is what
 * the bundles hq sends carry (`livePreview.refresh`), kept in the copy as `origin`'s main, since the workspace's
 * repository is on its own site. The copy is found by the live preview's record, for that workspace and branch, never
 * by what the copy says; the branch moving is told to hq, which brings it back by bundle.
 */
import {
  BRANCH_WORK_SITE_BUDGET_MS, RepoWorkError, UPDATE_CLASH_PATHS_MAX,
  type BranchUpdateFromMainParams, type BranchUpdateFromMainResult,
} from '@agenthix/core'
import { prisma } from '#db'
import { copyPlaceOf, ownCopyHead } from './livePreviewCopies'
import { reportMoved } from './livePreviewLife'
import { livePreviewRow } from './livePreviewStore'
import { runHelper } from '../branches/helperContainer'
import { requireFeature } from '../features/siteFeatures'

/**
 * Null when the copy is no live preview's own copy here; the caller then treats it as a branch's copy. A live
 * preview's own copy is refused while the live preview is off for the request (adr-0172).
 */
export async function updateOwnCopyFromMain(q: BranchUpdateFromMainParams, message: string): Promise<BranchUpdateFromMainResult | null> {
  const found = await prisma.livePreview.findFirst({ where: { copyId: q.copyId, copyKind: 'bundle', live: true }, select: { id: true } })
  const row = found ? await livePreviewRow(found.id) : null
  if (!row || row.state.state === 'stopped') return null
  requireFeature('livePreview')
  const ref = q.workspace
  if (row.workspaceId !== ref.workspaceId || row.ownerType !== ref.ownerType || row.ownerId !== ref.ownerId || row.branch !== q.branch) {
    throw new RepoWorkError('refused', `branch.updateFromMain: copy ${q.copyId} is not this branch's here. Nothing was changed.`)
  }
  const answer = await runHelper(
    { workspaceId: row.workspaceId, copy: { dir: copyPlaceOf(row).hostDir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
    { op: 'updateFromMain', branch: q.branch, message, author: q.author, at: new Date().toISOString() },
  )
  if (answer.refused) {
    throw new RepoWorkError('git_failed', `branch.updateFromMain could not bring main into the live preview's copy of ${q.branch}; the reason is in this site's log. Nothing was changed.`)
  }
  const paths = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, UPDATE_CLASH_PATHS_MAX) : [])
  if (answer.uncommitted) return { outcome: 'uncommitted' }
  if (answer.mergeUnderWay) return { outcome: 'merge_under_way', paths: paths(answer.mergeUnderWay) }
  if (typeof answer.upToDate === 'string') return { outcome: 'up_to_date', head: answer.upToDate }
  if (Array.isArray(answer.clashes)) return { outcome: 'clashes', paths: paths(answer.clashes), mainTip: String(answer.mainTip) }
  const commit = String(answer.commit)
  const previous = row.headCommit
  const head = (await ownCopyHead(row)) ?? commit
  await reportMoved(row, head, 'sweep', q.runId)
  return { outcome: 'updated', commit, fastForward: answer.fastForward === true, back: { head, previous, moved: false, backup: null } }
}
