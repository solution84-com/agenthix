/** The approval card's one read as a Wasp operation, hosted in `assets.wasp.ts`. Approving is the conversation's own. */
import { HttpError, prisma } from 'wasp/server'
import { assetRequestChange, type AssetRequestChange } from './assetRequestChange'

type Ctx = { user?: { id: string } | null }

export const getAssetRequestChange = async (args: unknown, context: Ctx): Promise<AssetRequestChange> => {
  if (!context.user) throw new HttpError(401)
  const a = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  return assetRequestChange(prisma, context.user.id, a.operationId)
}
