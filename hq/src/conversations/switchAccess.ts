/**
 * Moving a conversation onto the model it was offered when the one it talks on cannot be used (models from one place,
 * part 1, *When a provider fails*): the person's say, recorded in the thread as *Switched to …*, and the message its
 * failed turn took sent again. Anyone who may speak in the conversation may say it; the offer is worked out again by
 * access/talkingModel.ts, never taken from the caller.
 */
import { HttpError } from 'wasp/server'
import type { ConversationIdArgs } from '../shared/conversations/protocol'
import { requireConversationSpeaker } from './readingRule'
import { switchToOffer } from './access/talkingModel'
import { appendMessage } from './store/messages'
import type { AppendMessage } from './contract'
import { conversationEvents } from './coordinator/events'
import { scheduleConversation } from './coordinator/scheduler'

type Ctx = { user?: { id: string } | null }

export const switchConversationAccess = async (args: ConversationIdArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const ref = await requireConversationSpeaker(args?.conversationId, context.user.id)
  // The notice is shown as it is stored.
  const appendAndShow: AppendMessage = async (input) => {
    const stored = await appendMessage(input)
    conversationEvents.message(ref.id, stored.message)
    return stored
  }
  await switchToOffer(ref, context.user.id, appendAndShow)
  scheduleConversation(ref.id)
}
