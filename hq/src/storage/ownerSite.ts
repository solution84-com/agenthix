/**
 * Resolves the logical siteId (SiteConfig.siteId — what a channel request
 * addresses, see workspaceStore.ts's header comment) that owns a given
 * owner's storage: a project's own Execution Site, or the site a person's own
 * storage is placed on (`ensureUserStoragePlacement`, written at the default
 * site the first time) — the same answer `resolveStorageSite` gives and
 * `createWorkspaceAction` (actions.ts) places a person's workspaces by.
 *
 * Null means a project that names no site. With no Execution Site connected
 * at all, a person's storage has nowhere to be and this throws the shared
 * "No Execution Site is connected" error instead.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { ensureUserStoragePlacement } from './storageSite'

export async function resolveOwnerSiteId(ownerType: WorkspaceOwnerType, ownerId: string): Promise<string | null> {
  if (ownerType === 'project') {
    const project = await prisma.project.findUnique({
      where: { id: ownerId },
      select: { executionSite: { select: { siteId: true } } },
    })
    return project?.executionSite?.siteId ?? null
  }
  return ensureUserStoragePlacement(ownerId)
}
