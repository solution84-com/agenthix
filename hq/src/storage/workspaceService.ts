/**
 * Workspace Service (ADR-0039)
 * ============================
 * Create / delete a Workspace — a named storage unit owned by a context.
 * Owner is permanent (set at creation, never changed). The on-disk dir is derived.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { ensureDirOnSite } from './locationFileStore'
import * as store from './workspaceStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Workspaces')

export interface CreateWorkspaceParams {
  name: string
  ownerType: WorkspaceOwnerType
  ownerId: string
  /** ExecutionSite.id (this installation's registry PK) — what WorkspacePlacement (hq-local) keys by. */
  executionSiteId: string
  /** The owning site's logical SiteConfig.siteId — what the channel create call itself addresses. */
  logicalSiteId: string
}

/**
 * Creates the row on the owning site over the channel, then indexes it in hq's
 * local WorkspacePlacement (schema.prisma) — hq can no longer guarantee both
 * writes atomically now that they live in two databases. If the placement
 * insert fails after the site-side create succeeded, the row exists but hq
 * cannot find it (present on disk, absent from every list) — compensate by
 * deleting the just-created site-side row via the owner-scoped
 * `deleteWorkspaceAt` (bypasses placement resolution entirely, since there is
 * no placement row to resolve).
 *
 * The directory comes last, and after the placement, because the site the ask
 * is addressed to is resolved from that placement.
 */
export async function createWorkspace(params: CreateWorkspaceParams) {
  const workspace = await store.createWorkspace(params.logicalSiteId, {
    name: params.name.trim(),
    ownerType: params.ownerType,
    ownerId: params.ownerId,
  })
  try {
    await store.recordPlacement(workspace.id, params.executionSiteId)
  } catch (err) {
    // Best-effort compensation — its own failure must never mask the
    // original placement error (the `.catch` swallows it, not `throw err`
    // below), but it also must not go silent: an orphaned site-side row is
    // exactly the "present on disk, absent from every list" case this
    // compensation exists to prevent, so a failed cleanup needs the
    // workspace id logged for manual follow-up.
    await store.deleteWorkspaceAt(params.logicalSiteId, workspace.id).catch((cleanupErr) => {
      logger.warn(
        `createWorkspace: compensating delete of orphaned workspace ${workspace.id} ` +
          `(site ${params.logicalSiteId}) failed — manual cleanup needed:`,
        cleanupErr,
      )
    })
    throw err
  }
  // Asked for rather than made here: the directory is on the site's disk. And
  // it is asked for at all because a site creates a workspace's directory only
  // when a container starts in it — without this, a new workspace has no
  // directory, and every read of it fails, until something first runs there.
  await ensureDirOnSite({ ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id })
  return workspace
}

/**
 * Delete a Workspace: the row itself (RepoAttachment cascades site-side), and
 * its WorkspacePlacement index entry. Order matters now that the row and the
 * index live in different databases — no cross-database transaction is
 * possible:
 *   1. the site-side row (resolved via the placement, which must still be
 *      present for this call to find the right site — hence placement is
 *      NOT removed first)
 *   2. the placement row last, only once the site confirms the row is gone
 * A failure between steps 1 and 2 leaves a stale-but-harmless placement row
 * pointing at an already-deleted workspace — `removePlacement` on a later
 * retry (or a repeat `deleteWorkspaceAction` call) is idempotent, so this
 * self-heals rather than orphaning anything. The on-disk dir is left in
 * place — cleanup is a separate manual/admin op, matching prior behaviour.
 * No default guard: there is no default Workspace in this model.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await store.deleteWorkspace(workspaceId)
  await store.removePlacement(workspaceId)
}
