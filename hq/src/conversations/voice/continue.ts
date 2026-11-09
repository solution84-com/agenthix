/**
 * The person spoke again after their message was sent but before any of the reply was heard (adaptive voice spec,
 * orchestration: Response scheduler): the reply is cancelled, keeping none of it, their words join the message it
 * answers, and the whole is answered again — admitted as any message is, under their Wait or Interrupt setting
 * when another turn holds the conversation. A reply that answered no message of theirs, or one already followed
 * by another, leaves the words to be a message of their own.
 *
 * An encouragement response (Orchestration §5) was heard, and their words join the message all the
 * same: it is kept whole, withdrawn from the thread once they join, and the turn that answers is told of it.
 *
 * A turn the model held open (keep_listening) has no reply to cut: their words join the message it held, and the turn
 * that answers is told they went on.
 *
 * Words can name a reply already withdrawn for earlier words, when they come before the browser has heard of the turn
 * that answers again (#28): they join the same message — still waiting, or cancelling the turn that took it — so one
 * spoken message is answered by one turn, and no turn queues behind a reply that was never to be heard.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { MESSAGE_MAX_CHARS } from '../../shared/conversations/protocol'
import { admitMessage } from '../coordinator/admission'
import { conversationEvents } from '../coordinator/events'
import { scheduleConversation, stopRunningTurn } from '../coordinator/scheduler'
import { joinSpokenWords, joinWaitingWords, readEncouragement, updateMessage } from '../store/messages'
import { cancelReply, heldBySpeaker } from './service'
import type { VoiceSession } from './session'

/** Where words naming a withdrawn turn belong now: the message its words joined, waiting, or the turn that took it. */
async function followJoined(session: VoiceSession, conversationId: string, turnId: string): Promise<{ waiting: string } | { turnId: string } | null> {
  const messageId = session.joinedMessage(turnId)
  if (!messageId) return null
  const row = await prisma.conversationMessage.findFirst({ where: { id: messageId, conversationId }, select: { turnId: true } })
  if (!row) return null
  if (row.turnId === null) return { waiting: messageId }
  return row.turnId === turnId ? null : { turnId: row.turnId }
}

export async function continueVoice(
  socketId: string, userId: string, conversationId: string, named: string, text: string, trailedOff = false,
): Promise<void> {
  const words = text.trim()
  if (words === '') return
  const session = await heldBySpeaker(socketId, userId, conversationId)
  if (!session) return
  session.activity()
  session.trailedOff = trailedOff
  // The reply these words cut: the one they name, or the one that answers again the message earlier words joined.
  let turnId = named
  const joinedBefore = await followJoined(session, conversationId, named)
  if (joinedBefore && 'waiting' in joinedBefore) {
    const message = await joinWaitingWords(conversationId, userId, joinedBefore.waiting, words, MESSAGE_MAX_CHARS)
    if (message) {
      conversationEvents.messageUpdated(conversationId, message)
      scheduleConversation(conversationId)
      return
    }
  } else if (joinedBefore) {
    turnId = joinedBefore.turnId
  }
  const prompt = await readEncouragement(conversationId, turnId)
  const held = session.wasHeld(turnId)
  session.wentOnAfter = null
  session.wentOnAfterHold = false
  if (!prompt && !held) await cancelReply(session, conversationId, turnId, -1, true)

  const joined = await joinSpokenWords(conversationId, userId, turnId, words, MESSAGE_MAX_CHARS)
  if (!joined) {
    await admitMessage({ conversationId, text: words, clientMessageId: randomUUID(), spoken: true, trailedOff }, userId)
    return
  }
  conversationEvents.messageUpdated(conversationId, joined.message)
  session.joined(turnId, joined.message.id)
  if (named !== turnId) session.joined(named, joined.message.id)
  if (held) session.wentOnAfterHold = true
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
