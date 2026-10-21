/**
 * A person's answer to an approval card, and Stop on an operation's row or card (conversation layer spec,
 * Approval; Conversation activity, Stopping). Anyone who may speak in the conversation may do either; answering
 * also passes the asker's checks, re-run as the person who answers (toolCalls/).
 */
import { HttpError } from 'wasp/server'
import type { AnswerApprovalArgs, CancelOperationArgs, SendConversationMessageResult } from '../../shared/conversations/protocol'
import { requireConversationSpeaker } from '../readingRule'
import { answerRequest } from './toolCalls/answer'
import { stopOperation } from './toolCalls/stop'

type Ctx = { user?: { id: string } | null }

/** The longest client message id taken, as for a sent message. */
const CLIENT_ID_MAX = 100

function requireArgs(args: AnswerApprovalArgs): { operationId: string; clientMessageId: string } {
  if (args?.answer !== 'approve' && args?.answer !== 'decline') throw new HttpError(400, 'Answer with approve or decline')
  if (typeof args.operationId !== 'string' || args.operationId === '') throw new HttpError(400, 'Name the request to answer')
  const { clientMessageId } = args
  if (typeof clientMessageId !== 'string' || clientMessageId === '' || clientMessageId.length > CLIENT_ID_MAX) {
    throw new HttpError(400, 'An answer needs the id its client gave it')
  }
  if (args.note !== undefined && typeof args.note !== 'string') throw new HttpError(400, 'A note is text')
  return { operationId: args.operationId, clientMessageId }
}

export const answerConversationApproval = async (args: AnswerApprovalArgs, context: Ctx): Promise<SendConversationMessageResult> => {
  if (!context.user) throw new HttpError(401)
  const ref = await requireConversationSpeaker(args?.conversationId, context.user.id)
  const { operationId, clientMessageId } = requireArgs(args)
  const { message, duplicate, queued } = await answerRequest({
    conversationId: ref.id, operationId, answer: args.answer, note: args.note ?? null,
    answererId: context.user.id, via: { kind: 'card', clientMessageId },
  })
  return { messageId: message.id, seq: message.seq, queued, duplicate }
}

export const cancelConversationOperation = async (args: CancelOperationArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const ref = await requireConversationSpeaker(args?.conversationId, context.user.id)
  if (typeof args.operationId !== 'string' || args.operationId === '') throw new HttpError(400, 'Name the work to stop')
  await stopOperation(ref.id, args.operationId, context.user.id)
}
