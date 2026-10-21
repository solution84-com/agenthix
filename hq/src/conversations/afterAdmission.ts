/**
 * Where a person's message, once stored, is handed on to be answered: the coordinator schedules the
 * conversation's next turn. Called after the message's transaction has committed, never inside it.
 */
import type { ConversationMessageView } from '../shared/conversations/protocol'
import { conversationEvents } from './coordinator/events'
import { scheduleConversation } from './coordinator/scheduler'

export async function afterMessageAdmitted(conversationId: string, message: ConversationMessageView): Promise<void> {
  conversationEvents.message(conversationId, message)
  scheduleConversation(conversationId)
}
