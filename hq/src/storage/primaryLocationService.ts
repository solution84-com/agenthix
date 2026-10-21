/**
 * Primary-location resolution (ADR-0039)
 * ======================================
 * A session works in a primary storage *location* (an owner's files/ or a workspace).
 * Focused sessions carry the location on the row; a general 1:1 chat falls back to the
 * user's files/ (the personal home), provisioned lazily.
 *
 * hq only names the location. Creating the directory it names is site's, whose
 * copy carries `getLocationCwd` for it — hq reaches no site's disk.
 */
import type { WorkspaceOwnerType } from '@prisma/client'
import type { LocationRef } from '@agenthix/core'

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
