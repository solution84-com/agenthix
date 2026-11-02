/**
 * Runs on a branch that has a live preview here (live preview spec section 4, *While an agent works on the same
 * branch*). Every code-work run on a branch is remembered while it goes, for `noRun` and the guard. A run working in
 * a live preview's own copy on this site (copy kind `bundle`, `RunCodeWork.livePreviewId`) is found by the live
 * preview's record, never its branch copies; its commits are told to hq with `livePreview.branchMoved` on the
 * one-minute sweep and at its end, and hq brings them back by bundle.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { BRANCH_WORK_SITE_BUDGET_MS, type RunCodeWork } from '@agenthix/core'
import { ReadableRunError } from '../../agents/runtime/readableRunError'
import { ownerDir } from '../storage/paths'
import type { CodeWorkRun } from '../branches/codeWorkRun'
import { withOnBehalfOf } from '../branches/branchWorkMethods'
import { runEnded, runStarted } from './livePreviewActivity'
import { copyPlaceOf, ownCopyHead, previewHelper } from './livePreviewCopies'
import { reportMoved } from './livePreviewLife'
import { liveOnBranch, livePreviewRow, trackRun } from './livePreviewStore'

export async function resolveLivePreviewCopy(
  runId: string, codeWork: RunCodeWork, boundary: { ownerType: string; ownerId: string },
): Promise<CodeWorkRun> {
  const refused = new ReadableRunError(
    `The live preview of branch ${codeWork.branch} is not on this site, or is not this work's. Start the work again from HQ. Nothing was changed.`,
  )
  const ref = codeWork.workspace
  const row = codeWork.livePreviewId ? await livePreviewRow(codeWork.livePreviewId) : null
  if (!row || row.state.state === 'stopped' || row.copyKind !== 'bundle' || row.copyId !== codeWork.copyId
    || row.workspaceId !== ref.workspaceId || row.ownerType !== ref.ownerType || row.ownerId !== ref.ownerId
    || row.branch !== codeWork.branch || ref.ownerType !== boundary.ownerType || ref.ownerId !== boundary.ownerId) throw refused
  const copyDir = copyPlaceOf(row).hostDir
  const st = await fs.lstat(path.join(copyDir, '.git')).catch(() => null)
  if (!st?.isDirectory()) throw refused
  const owner = ownerDir(ref.ownerType, ref.ownerId)
  return {
    runId, placed: { ref, owner, ws: path.join(owner, 'workspaces', ref.workspaceId) }, copyId: row.copyId, branch: row.branch,
    copyDir, author: codeWork.author, onBehalfOf: codeWork.onBehalfOf, livePreviewId: row.id,
  }
}

export async function livePreviewRunStarts(run: CodeWorkRun): Promise<void> {
  runStarted(run.placed.ref.workspaceId, run.branch, run.runId, { author: run.author, onBehalfOf: run.onBehalfOf })
  // Remembering the run is for the live preview's sake: a record that cannot be read fails no run.
  const row = await (run.livePreviewId ? livePreviewRow(run.livePreviewId) : liveOnBranch(run.placed.ref.workspaceId, run.branch)).catch(() => null)
  if (row && row.state.state !== 'stopped') await trackRun(row.id, run.runId).catch(() => null)
}

export async function sweepLivePreviewCopy(run: CodeWorkRun, cause: 'sweep' | 'run_end' = 'sweep'): Promise<void> {
  const row = run.livePreviewId ? await livePreviewRow(run.livePreviewId) : null
  if (!row || row.copyKind !== 'bundle') return
  const head = await ownCopyHead(row)
  if (head && head !== row.headCommit) await reportMoved(row, head, cause, run.runId)
}

export async function livePreviewRunEnds(run: CodeWorkRun): Promise<void> {
  runEnded(run.placed.ref.workspaceId, run.branch, run.runId)
  if (!run.livePreviewId) return
  const row = await livePreviewRow(run.livePreviewId)
  if (!row || row.copyKind !== 'bundle') return
  await previewHelper(
    { workspaceId: row.workspaceId, copy: { dir: copyPlaceOf(row).hostDir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
    { op: 'copyCommit', branch: row.branch, message: withOnBehalfOf('Work in progress', run.onBehalfOf), author: run.author, at: new Date().toISOString() },
    `the work-in-progress commit at the end of run ${run.runId}`,
  )
  await sweepLivePreviewCopy(run, 'run_end')
}
