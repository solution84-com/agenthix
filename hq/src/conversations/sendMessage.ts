/**
 * Sending a message into a conversation (conversation layer spec, A message while a reply streams): admitted by
 * the coordinator, answered by a turn now or, while one runs, after it.
 */
import { HttpError } from 'wasp/server'
import type { SendConversationMessageArgs, SendConversationMessageResult } from '../shared/conversations/protocol'
import { admitMessage } from './coordinator/admission'

type Ctx = { user?: { id: string } | null }

export const sendConversationMessage = async (args: SendConversationMessageArgs, context: Ctx): Promise<SendConversationMessageResult> => {
  if (!context.user) throw new HttpError(401)
  return admitMessage(args, context.user.id)
}
