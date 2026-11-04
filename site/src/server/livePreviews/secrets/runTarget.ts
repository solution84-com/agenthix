/**
 * A workflow run aimed at a live preview (core's `WorkflowRunInstruction.livePreview`), as the executor sees it: the
 * site checks its own record again before the run is taken, and again before its secrets are handed. The live preview
 * must be this site's, running, on the instruction's workspace; the run's steps then work on the live preview's copy,
 * where its app runs, rather than on the workspace's folder.
 */
import type { WorkflowRunInstruction } from '@agenthix/core'
import { closeDir, openRoot, type TreeRoot } from '../../../agents/runtime/safeTree'
import { boundaryCopyOf } from '../../storage/paths'
import { copyPlaceOf } from '../livePreviewCopies'
import type { LivePreviewRow } from '../livePreviewRows'
import { livePreviewRow } from '../livePreviewStore'

/** `root` is how the copy is opened: one in a boundary through open folders from the boundary's own (adr-0173). */
export type LivePreviewRunTarget = { livePreviewId: string; hostDir: string; root: TreeRoot; containerDir: string }

/** The live preview, when it is this site's, running, and on the run's workspace; null otherwise. */
export async function runningPreviewFor(ins: Pick<WorkflowRunInstruction, 'livePreview' | 'workspace'>): Promise<LivePreviewRow | null> {
  const id = ins.livePreview?.livePreviewId
  if (!id) return null
  const row = await livePreviewRow(id)
  const w = ins.workspace
  if (!row || row.state.state !== 'running' || row.containersRemoved) return null
  if (w.workspaceId === null || row.workspaceId !== w.workspaceId || row.ownerType !== w.ownerType || row.ownerId !== w.ownerId) return null
  return row
}

/** Where the run's steps work: the live preview's copy, on this disk and at the agent's path; null when it cannot. */
export async function livePreviewRunTarget(ins: Pick<WorkflowRunInstruction, 'livePreview' | 'workspace'>): Promise<LivePreviewRunTarget | null> {
  const row = await runningPreviewFor(ins)
  if (!row) return null
  const place = copyPlaceOf(row)
  const inBoundary = boundaryCopyOf(place.hostDir)
  const root: TreeRoot = inBoundary ? { base: inBoundary.boundary, rel: `clones/${inBoundary.copyId}` } : place.hostDir
  const opened = await openRoot(root).catch(() => null)
  if (!opened) return null
  await closeDir(opened)
  return { livePreviewId: row.id, hostDir: place.hostDir, root, containerDir: place.containerDir }
}
