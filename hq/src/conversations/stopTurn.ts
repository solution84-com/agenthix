/**
 * Stopping the reply being written (conversation layer spec, Inference turn): anyone who may speak in the
 * conversation may stop it; what was streamed is kept, marked interrupted. Nothing running is not an error.
 */
import { HttpError } from 'wasp/server'
import type { ConversationIdArgs } from '../shared/conversations/protocol'
import { requireConversationSpeaker } from './readingRule'
import { stopRunningTurn } from './coordinator/scheduler'

type Ctx = { user?: { id: string } | null }

export const stopConversationTurn = async (args: ConversationIdArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const ref = await requireConversationSpeaker(args?.conversationId, context.user.id)
  await stopRunningTurn(ref.id, 'stop')
}
