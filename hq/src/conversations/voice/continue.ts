/**
 * The person spoke again after their message was sent but before any of the reply was heard (adaptive voice spec,
 * orchestration: Response scheduler): the reply is cancelled, keeping none of it, their words join the message it
 * answers, and the whole is answered again — admitted as any message is, under their Wait or Interrupt setting
 * when another turn holds the conversation. A reply that answered no message of theirs, or one already followed
 * by another, leaves the words to be a message of their own.
 *
 * An encouragement response (Orchestration §5) was heard, and their words join the message all the
 * same: it is kept whole, withdrawn from the thread once they join, and the turn that answers is told of it.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { MESSAGE_MAX_CHARS } from '../../shared/conversations/protocol'
import { admitMessage } from '../coordinator/admission'
import { conversationEvents } from '../coordinator/events'
import { scheduleConversation, stopRunningTurn } from '../coordinator/scheduler'
import { joinSpokenWords, readEncouragement, updateMessage } from '../store/messages'
import { cancelReply, heldBySpeaker } from './service'

export async function continueVoice(
  socketId: string, userId: string, conversationId: string, turnId: string, text: string, trailedOff = false,
): Promise<void> {
  const words = text.trim()
  if (words === '') return
  const session = await heldBySpeaker(socketId, userId, conversationId)
  if (!session) return
  session.activity()
  session.trailedOff = trailedOff
  const prompt = await readEncouragement(conversationId, turnId)
  session.wentOnAfter = null
  if (!prompt) await cancelReply(session, conversationId, turnId, -1, true)

  const joined = await joinSpokenWords(conversationId, userId, turnId, words, MESSAGE_MAX_CHARS)
  if (!joined) {
    await admitMessage({ conversationId, text: words, clientMessageId: randomUUID(), spoken: true, trailedOff }, userId)
    return
  }
  conversationEvents.messageUpdated(conversationId, joined.message)
  if (prompt?.kind === 'TEXT') {
    session.wentOnAfter = prompt.body.text
    conversationEvents.messageUpdated(conversationId, await updateMessage(prompt.id, { withdrawn: true }))
  }
  for (const message of joined.returned) conversationEvents.messageUpdated(conversationId, message)
  // The reply cancelled above is still ending; any other turn holding the conversation meets the person's setting.
  if (joined.busyWith && joined.busyWith !== turnId) {
    const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { busyConversationMode: true } })
    if (settings?.busyConversationMode === 'INTERRUPT') await stopRunningTurn(conversationId, 'interrupt')
  }
  scheduleConversation(conversationId)
}
