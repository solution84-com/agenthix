/**
 * Primary-location resolution (ADR-0039)
 * ======================================
 * A session works in a primary storage *location* (an owner's files/ or a workspace).
 * Focused sessions carry the location on the row; a general 1:1 chat falls back to the
 * user's files/ (the personal home), provisioned lazily.
 *
 * Copied from hq/src/storage/primaryLocationService.ts — pure filesystem
 * logic, no Prisma dependency. The shared region, up to the end of
 * `resolvePrimaryLocation`, is kept byte-identical by a drift test on each
 * side. `getLocationCwd` below is site's alone: it creates the directory the
 * shared region names, and hq reaches no site's disk.
 */
import path from 'node:path'
import type { WorkspaceOwnerType } from '@prisma/client'
import { ensureFoldersUnder } from '../../agents/runtime/homeFolder'
import { isCodeWorkspace } from './codeSpace'
import { locationDir, type LocationRef } from './paths'
import { getCodeDir, ownerDir } from './paths'

export interface SessionLocationFields {
  primaryOwnerType: WorkspaceOwnerType | null
  primaryOwnerId: string | null
  primaryWorkspaceId: string | null
  /** Present on task-scoped sessions (ADR-0039 §10). When set, the primary location is tasks/{taskId}/. */
  taskId?: string | null
  userId: string
  /** 'chat' or 'task'. */
  sessionType: string
}

/** Resolve a session's primary location — its row's location, or the user's files. */
export function resolvePrimaryLocation(session: SessionLocationFields): LocationRef {
  if (session.primaryOwnerType && session.primaryOwnerId) {
    // Task session: the primary location is the task's working directory.
    if (session.taskId) {
      return {
        ownerType: session.primaryOwnerType,
        ownerId: session.primaryOwnerId,
        taskId: session.taskId,
      }
    }
    return {
      ownerType: session.primaryOwnerType,
      ownerId: session.primaryOwnerId,
      workspaceId: session.primaryWorkspaceId ?? undefined,
    }
  }
  return { ownerType: 'user', ownerId: session.userId }
}

/**
 * Ensure + return the run cwd for a location, as this process sees it. A repository workspace's is its `main` in the
 * code space. Any other is made from the boundary's own folder down, never through a symlink a run left there
 * (adr-0173).
 */
export async function getLocationCwd(loc: LocationRef): Promise<string> {
  if (loc.workspaceId && !loc.taskId) {
    const ws = { ownerType: loc.ownerType, ownerId: loc.ownerId, workspaceId: loc.workspaceId }
    if (await isCodeWorkspace(ws)) return getCodeDir(ws)
  }
  const dir = locationDir(loc)
  const boundary = ownerDir(loc.ownerType, loc.ownerId)
  await ensureFoldersUnder(boundary, [path.relative(boundary, dir)])
  return dir
}
