/**
 * Resolves the logical siteId (SiteConfig.siteId — what a channel request
 * addresses, see workspaceStore.ts's header comment) that owns a given
 * owner's storage: a project's own Execution Site, or the default site for a
 * person's own storage — the same rule `createWorkspaceAction` (actions.ts)
 * applies at creation time, so a repo/files read for an owner resolves to the
 * same site its workspaces were placed on. A person's own storage cannot be
 * placed on any site but the default.
 *
 * Null means a project that names no site. With no Execution Site connected
 * at all, a person's storage has nowhere to be and this throws the shared
 * "No Execution Site is connected" error instead.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { requireDefaultSiteId } from '../sites/localSite'

export async function resolveOwnerSiteId(ownerType: WorkspaceOwnerType, ownerId: string): Promise<string | null> {
  if (ownerType === 'project') {
    const project = await prisma.project.findUnique({
      where: { id: ownerId },
      select: { executionSite: { select: { siteId: true } } },
    })
    return project?.executionSite?.siteId ?? null
  }
  return requireDefaultSiteId()
}
