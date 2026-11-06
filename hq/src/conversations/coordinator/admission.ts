/**
 * Admitting a person's message (conversation layer spec, A message while a reply streams): the sender is
 * checked as a speaker, the message stored with the client's id and its place in order — a repeat is the same
 * message — and, when a turn is running, stored as waiting. By the sender's setting it then waits for that turn
 * (WAIT) or stops it (INTERRUPT); either way the waiting messages are taken in order when the turn ends.
 *
 * A spoken message (voice, phase 5) is admitted the same way. It is recorded as spoken only from the person who
 * holds voice in the conversation, and keeps their voice from ending for silence.
 */
import { HttpError, prisma } from 'wasp/server'
import { SHARED_FILES_PER_MESSAGE, sharedFilesOf, type SharedFile } from '@agenthix/core'
import { MESSAGE_MAX_CHARS, type SendConversationMessageArgs, type SendConversationMessageResult } from '../../shared/conversations/protocol'
import { requireConversationSpeaker } from '../readingRule'
import { appendMessageIn } from '../store/messages'
import { conversationEvents } from './events'
import { scheduleConversation, stopRunningTurn } from './scheduler'
import { voiceSession } from '../voice/registry'
import { requirePickedSkill } from '../work/pickedSkill'

/** The longest client message id taken: a UUID, with room to spare (as startConversation.ts). */
const CLIENT_ID_MAX = 100

/**
 * The photos and files a message carries, each already kept in the place's shared folder: named there, and checked
 * for their shape only. Their bytes are read from that folder, and checked again, when a turn gives them to a model.
 */
function requireShared(value: unknown): SharedFile[] {
  if (value === undefined || value === null) return []
  const shared = sharedFilesOf(value)
  if (!Array.isArray(value) || value.length > SHARED_FILES_PER_MESSAGE || shared.length !== value.length) {
    throw new HttpError(400, `A message carries at most ${SHARED_FILES_PER_MESSAGE} photos or files, each added from the message box`)
  }
  return shared
}

function requireMessage(args: SendConversationMessageArgs, withShared: boolean): { text: string; clientMessageId: string } {
  const text = typeof args?.text === 'string' ? args.text.trim() : ''
  if (text === '' && !withShared) throw new HttpError(400, 'Write a message to send')
  if (text.length > MESSAGE_MAX_CHARS) throw new HttpError(400, `A message can be at most ${MESSAGE_MAX_CHARS} characters`)
  const clientMessageId = args.clientMessageId
  if (typeof clientMessageId !== 'string' || clientMessageId === '' || clientMessageId.length > CLIENT_ID_MAX) {
    throw new HttpError(400, 'A message needs the id its client gave it')
  }
  return { text, clientMessageId }
}

export async function admitMessage(args: SendConversationMessageArgs, userId: string): Promise<SendConversationMessageResult> {
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  const shared = requireShared(args?.shared)
  const { text, clientMessageId } = requireMessage(args, shared.length > 0)
  const skill = requirePickedSkill(args?.skill)

  const { message, duplicate } = await prisma.$transaction(async (tx) => {
    // Under the row lock the claim also takes: a turn either holds the conversation now or it does not.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${ref.id} FOR UPDATE`
    const row = await tx.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { activeTurnId: true, activeTurnLeaseUntil: true, voiceHolderId: true } })
    const busy = row.activeTurnId !== null && row.activeTurnLeaseUntil !== null && row.activeTurnLeaseUntil >= new Date()
    return appendMessageIn(tx, {
      conversationId: ref.id,
      role: 'PERSON',
      kind: 'TEXT',
      body: { text, ...(skill && { skill }), ...(shared.length > 0 && { shared }) },
      authorId: userId,
      clientMessageId,
      queueState: busy ? 'WAITING' : null,
      spoken: args.spoken === true && row.voiceHolderId === userId,
    })
  })
  const queued = message.queueState === 'WAITING'

  if (!duplicate) {
    if (message.spoken) {
      const session = voiceSession(ref.id)
      session?.activity()
      if (session) { session.trailedOff = args.trailedOff === true; session.wentOnAfter = null }
    }
    conversationEvents.message(ref.id, message)
    if (queued) {
      const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { busyConversationMode: true } })
      if (settings?.busyConversationMode === 'INTERRUPT') await stopRunningTurn(ref.id, 'interrupt')
    }
  }
  scheduleConversation(ref.id)
  return { messageId: message.id, seq: message.seq, queued, duplicate }
}
