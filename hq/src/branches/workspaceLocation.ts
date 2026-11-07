/**
 * Where a workspace is: its owner and the site that holds it, with no access check, for the server's own work
 * (dispatch, a site's event, a worker's place). Kept apart from the access rule (`workspaceAccess.ts`) so that what
 * dispatch imports never reaches the location access module, which the site channel's own imports would otherwise
 * load in a cycle.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceRepoRef } from '@agenthix/core'
import { getWorkspace } from '../storage/workspaceStore'

export type LocatedWorkspace = {
  ref: WorkspaceRepoRef
  name: string
  /** The site's own id, as the channel addresses it. */
  logicalSiteId: string
  /** `ExecutionSite.id`, as `BranchCopy.siteId` keeps it. */
  executionSiteId: string
}

/** The workspace and where it is, with no access check: for the server's own work (dispatch, a site's event). */
export async function locateWorkspace(workspaceId: string): Promise<LocatedWorkspace | null> {
  const placement = await prisma.workspacePlacement.findUnique({ where: { workspaceId }, select: { siteId: true } })
  if (!placement) return null
  const [ws, site] = await Promise.all([
    getWorkspace(workspaceId),
    prisma.executionSite.findUnique({ where: { id: placement.siteId }, select: { siteId: true } }),
  ])
  if (!ws || !site) return null
  return {
    ref: { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.id },
    name: ws.name,
    logicalSiteId: site.siteId,
    executionSiteId: placement.siteId,
  }
}
