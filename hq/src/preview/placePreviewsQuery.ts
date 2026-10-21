import { HttpError, prisma } from 'wasp/server'
import type { StorageOwnerType } from '@agenthix/core'
import { assertLocationAccess } from '../storage/locationAccess'

// A type, not an interface: Wasp's payload check needs the index signature a type has.
export type PlacePreview = {
  /** The row's id, which `/open-preview/:previewId` takes. */
  id: string
  workspaceId: string | null
}

/**
 * The previews running in one place, for the Workspaces tool: which workspace
 * has one, and the address to open it. Opening still goes through
 * `openPreview`'s own access check.
 */
export const listPlacePreviewsQuery = async (
  args: { ownerType: StorageOwnerType; ownerId: string },
  context: { user?: { id: string } },
): Promise<{ previews: PlacePreview[] }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess({ ownerType: args.ownerType, ownerId: args.ownerId }, context.user.id, 'read')
  const rows = await prisma.previewSession.findMany({
    where: { ownerType: args.ownerType, ownerId: args.ownerId, status: 'running', expiresAt: { gt: new Date() } },
    select: { id: true, workspaceId: true },
    orderBy: { createdAt: 'desc' },
  })
  return { previews: rows }
}
