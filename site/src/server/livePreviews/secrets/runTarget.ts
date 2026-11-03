/**
 * A workflow run aimed at a live preview (core's `WorkflowRunInstruction.livePreview`), as the executor sees it: the
 * site checks its own record again before the run is taken, and again before its secrets are handed. The live preview
 * must be this site's, running, on the instruction's workspace; the run's steps then work on the live preview's copy,
 * where its app runs, rather than on the workspace's folder.
 */
import fs from 'node:fs/promises'
import type { WorkflowRunInstruction } from '@agenthix/core'
import { copyPlaceOf } from '../livePreviewCopies'
import type { LivePreviewRow } from '../livePreviewRows'
import { livePreviewRow } from '../livePreviewStore'

export type LivePreviewRunTarget = { livePreviewId: string; hostDir: string; containerDir: string }

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
  const entry = await fs.lstat(place.hostDir).catch(() => null)
  if (!entry?.isDirectory()) return null
  return { livePreviewId: row.id, hostDir: place.hostDir, containerDir: place.containerDir }
}
