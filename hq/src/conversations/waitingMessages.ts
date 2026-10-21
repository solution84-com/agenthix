/**
 * A message waiting for the reply in progress, as today's waiting message (sessions/conversationActions.ts):
 *
 * - **Send now** — the running reply is stopped for it, as Interrupt would have, and the waiting messages are
 *   taken next, in order.
 * - **Cancel** — withdrawn before a turn takes it; only its sender may. Decided under the conversation's row
 *   lock, the one a turn's claim takes, so a message is never both cancelled and answered.
 */
import { HttpError, prisma } from 'wasp/server'
import type { WaitingMessageArgs } from '../shared/conversations/protocol'
import { requireConversationSpeaker } from './readingRule'
import { toMessageView } from './store/messages'
import { conversationEvents } from './coordinator/events'
import { scheduleConversation, stopRunningTurn } from './coordinator/scheduler'

type Ctx = { user?: { id: string } | null }

export const MESSAGE_NOT_FOUND = 'Message not found'
export const NOT_WAITING = 'This message is no longer waiting: the agent has started on it.'
export const ONLY_SENDER_CANCELS = 'Only the person who sent a message can cancel it'

async function requireWaiting(args: WaitingMessageArgs, userId: string) {
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  if (typeof args.messageId !== 'string') throw new HttpError(404, MESSAGE_NOT_FOUND)
  const message = await prisma.conversationMessage.findFirst({
    where: { id: args.messageId, conversationId: ref.id, role: 'PERSON' },
    select: { id: true, authorId: true, queueState: true, turnId: true },
  })
  if (!message) throw new HttpError(404, MESSAGE_NOT_FOUND)
  if (message.queueState !== 'WAITING' || message.turnId !== null) throw new HttpError(409, NOT_WAITING)
  return { ref, message }
}

export const sendWaitingConversationMessageNow = async (args: WaitingMessageArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const { ref } = await requireWaiting(args, context.user.id)
  await stopRunningTurn(ref.id, 'interrupt')
  scheduleConversation(ref.id)
}

export const cancelWaitingConversationMessage = async (args: WaitingMessageArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const { ref, message } = await requireWaiting(args, context.user.id)
  if (message.authorId !== context.user.id) throw new HttpError(403, ONLY_SENDER_CANCELS)

  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${ref.id} FOR UPDATE`
    // Only the queue's column: store/messages.ts's updateMessage cannot join this transaction.
    const { count } = await tx.conversationMessage.updateMany({
      where: { id: message.id, queueState: 'WAITING', turnId: null },
      data: { queueState: 'CANCELLED' },
    })
    if (count === 0) throw new HttpError(409, NOT_WAITING)
    return tx.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })
  })
  conversationEvents.messageUpdated(ref.id, toMessageView(cancelled))
}
