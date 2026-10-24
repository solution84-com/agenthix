/**
 * The workspace a run works on, on this site's disk and inside the agent's container. Only the run's own workspace,
 * never the owner's whole storage folder (workflows spec part 2, *Only the run's workspace*): a workspace this site
 * holds a row for, or the owner's own files when no workspace is named.
 */
import fs from 'node:fs/promises'
import { prisma } from '#db'
import type { WorkflowRunWorkspace } from '@agenthix/core'
import { locationDir } from '../server/storage/paths'
import { resolvePrimaryContainerDir } from '../agents/runtime/locationResolver'

export type WorkspaceTarget = {
  /** On this site's disk. */
  hostDir: string
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
  const hostDir = locationDir(ref)
  const entry = await fs.lstat(hostDir).catch(() => null)
  if (!entry || !entry.isDirectory()) return null
  return { hostDir, containerDir: resolvePrimaryContainerDir(ref) }
}
