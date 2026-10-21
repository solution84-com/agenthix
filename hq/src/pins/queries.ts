import type { GetPins } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { visiblePinnedItems } from './pinnedItems'
import type { PinnedItem } from './pinTypes'

export const getPins: GetPins<void, PinnedItem[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return visiblePinnedItems(context.user.id)
}
