/**
 * The workspace a run works on, on this site's disk and inside the agent's container. Only the run's own workspace,
 * never the owner's whole storage folder (workflows spec part 2, *Only the run's workspace*): a workspace this site
 * holds a row for, or the owner's own files when no workspace is named.
 */
import path from 'node:path'
import { prisma } from '#db'
import type { WorkflowRunWorkspace } from '@agenthix/core'
import { getCodeDir, locationDir, ownerDir } from '../server/storage/paths'
import { isCodeWorkspace } from '../server/storage/codeSpace'
import { resolvePrimaryContainerDir } from '../agents/runtime/locationResolver'
import { closeDir, openRoot, type TreeRoot } from './safeTree'

export type WorkspaceTarget = {
  /** On this site's disk. */
  hostDir: string
  /**
   * How it is opened (adr-0173): a repository workspace's `main` in the code space by its path, which no container can
   * change; any other folder through open folders from the boundary's own folder, never through a symlink a run left.
   */
  root: TreeRoot
  /** Where the agent's container sees it, and where each step has the snapshot. */
  containerDir: string
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/** Null when this site does not hold that workspace. */
export async function resolveWorkspaceTarget(ws: WorkflowRunWorkspace): Promise<WorkspaceTarget | null> {
  if (!SAFE_ID.test(ws.ownerId) || (ws.workspaceId !== null && !SAFE_ID.test(ws.workspaceId))) return null
  if (ws.workspaceId !== null) {
    const row = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
    if (!row || row.ownerType !== ws.ownerType || row.ownerId !== ws.ownerId) return null
  }
  const ref = { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.workspaceId ?? undefined }
  const containerDir = resolvePrimaryContainerDir(ref)
  if (ws.workspaceId !== null) {
    const repo = { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.workspaceId }
    if (await isCodeWorkspace(repo)) return { hostDir: getCodeDir(repo), root: getCodeDir(repo), containerDir }
  }
  const hostDir = locationDir(ref)
  const base = ownerDir(ws.ownerType, ws.ownerId)
  const root = { base, rel: path.relative(base, hostDir).split(path.sep).join('/') }
  const opened = await openRoot(root).catch(() => null)
  if (!opened) return null
  await closeDir(opened)
  return { hostDir, root, containerDir }
}
