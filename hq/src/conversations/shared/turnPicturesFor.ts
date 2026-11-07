/** A turn's pictures, wired to the conversation's own place on its site and to its record (coordinator/turnPictures.ts). */
import { modelTakesImages, type AiProviderVendor, type LocationRef } from '@agenthix/core'
import type { ResolvedAccess } from '../contract'
import type { TurnConversation } from '../coordinator/claim'
import { turnPictures, type TurnPictures } from '../coordinator/turnPictures'
import { conversationEvents } from '../coordinator/events'
import { markUnseenBy } from '../store/messages'
import { ownPlace } from '../places'
import { modelLabel } from '../../routing/modelKeys'
import { readSharedOnSite } from './onSite'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('ConversationPictures')

export function picturesFor(conversation: TurnConversation, access: ResolvedAccess, inputIds: readonly string[]): TurnPictures {
  let place: Promise<LocationRef | null> | null = null
  const placeOf = () => (place ??= ownPlace(conversation).then(p =>
    p ? { ownerType: p.type === 'user' ? 'user' : 'project', ownerId: p.id, workspaceId: null, taskId: null } : null))
  return turnPictures({
    takes: modelTakesImages(access.provider, access.model),
    modelLabel: modelLabel(access.provider as AiProviderVendor, access.model),
    inputIds,
    source: {
      async read(name) {
        const loc = await placeOf()
        if (!loc) throw new Error("the conversation's place is gone")
        return readSharedOnSite(loc, name)
      },
      async unseen(ids, label) {
        for (const id of ids) {
          const view = await markUnseenBy(id, label)
          if (view) conversationEvents.message(conversation.id, view)
        }
      },
      log: line => logger.warn(line),
    },
  })
}
