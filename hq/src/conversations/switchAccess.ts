/**
 * Moving a conversation onto the access it was offered when its own stopped being usable (model access spec):
 * the person's say, recorded in the thread as a notice. Anyone who may speak in the conversation may say it;
 * the offer is worked out again by access/talkingModelSwitch.ts, never taken from the caller.
 */
import { HttpError } from 'wasp/server'
import type { ConversationIdArgs } from '../shared/conversations/protocol'
import { requireConversationSpeaker } from './readingRule'
import { switchToOfferedAccess } from './access/talkingModelSwitch'
import { appendMessage } from './store/messages'
import type { AppendMessage } from './contract'
import { conversationEvents } from './coordinator/events'
import { scheduleConversation } from './coordinator/scheduler'
import { latestRefusal } from './coordinator/refusal'

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
  // A key the provider refused on the latest turn is switched away from, though it is still stored.
  await switchToOfferedAccess(ref, context.user.id, appendAndShow, await latestRefusal(ref.id))
  scheduleConversation(ref.id)
}
