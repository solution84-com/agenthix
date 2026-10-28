/** The Add screen's one read: Agenthix's shelf and what the viewer may add. Installing goes through `previewAssetInstall` and `installAsset`. */
import { HttpError, prisma } from 'wasp/server'
import { personActor } from '../../policyActors'
import { shelfView, type ShelfView } from './shelf'

type Ctx = { user?: { id: string } | null }

export const getAssetShelf = async (_args: unknown, context: Ctx): Promise<ShelfView> => {
  if (!context.user) throw new HttpError(401)
  const viewer = await personActor(context.user.id, prisma)
  if (viewer.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  return shelfView(prisma, viewer)
}
