/**
 * A code workspace as the branch operations reach it (live preview spec, *Who sees what*): the workspace, its
 * owner, and the site that holds it, after the location access rule. Reading needs read access (a project's Viewer
 * included); acting needs a Member or Admin of the project, or the owner of their own storage. A Viewer is refused 403.
 */
import { HttpError } from 'wasp/server'
import type { WorkspaceRepoRef } from '@agenthix/core'
import { assertLocationAccess, type LocationUse } from '../storage/locationAccess'
import { locateWorkspace, type LocatedWorkspace } from './workspaceLocation'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { projectStanding } from '../projects/membership'

export type ReachedWorkspace = LocatedWorkspace & {
  /** Whether the person may act here: merge, restore, rename, delete, turn Git on. */
  canAct: boolean
}

/** Whether the person may act in this owner's storage: a project's Member or Admin, or the person themselves. */
export async function mayActIn(ref: Pick<WorkspaceRepoRef, 'ownerType' | 'ownerId'>, userId: string): Promise<boolean> {
  if (ref.ownerType === 'user') return ref.ownerId === userId
  return (await projectStanding(ref.ownerId, userId)) === 'works'
}

export async function reachWorkspace(workspaceId: unknown, userId: string, use: LocationUse): Promise<ReachedWorkspace> {
  if (typeof workspaceId !== 'string' || workspaceId.length === 0 || workspaceId.length > 200) {
    throw new HttpError(400, 'A workspace id is required')
  }
  let found: LocatedWorkspace | null
  try {
    found = await locateWorkspace(workspaceId)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  if (!found) throw new HttpError(404, 'Workspace not found')
  await assertLocationAccess({ ...found.ref }, userId, use)
  return { ...found, canAct: use === 'work' ? true : await mayActIn(found.ref, userId) }
}

export function requireUser(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}
