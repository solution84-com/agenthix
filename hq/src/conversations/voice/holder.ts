/**
 * Who holds voice in a conversation (conversational experience spec, Voice; data model `voiceHolderId`): one
 * person at a time, taken and given back under the conversation's row lock, each change written into the record
 * as a quiet line — "Voice", and "Voice ended" with how long it was on.
 */
import { prisma } from 'wasp/server'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { appendMessageIn } from '../store/messages'

export const HQ_RESTARTED_VOICE = 'Voice ended because HQ restarted.'

export type TakeResult =
  | { taken: true; started: ConversationMessageView | null }
  | { taken: false; holderId: string }

/** Takes voice for the person. Taking it again while holding it writes nothing; anyone else holding it refuses. */
export async function takeVoice(conversationId: string, userId: string): Promise<TakeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const row = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { voiceHolderId: true } })
    if (row.voiceHolderId && row.voiceHolderId !== userId) return { taken: false as const, holderId: row.voiceHolderId }
    if (row.voiceHolderId === userId) return { taken: true as const, started: null }
    await tx.conversation.update({ where: { id: conversationId }, data: { voiceHolderId: userId } })
    const { message } = await appendMessageIn(tx, { conversationId, role: 'PLATFORM', kind: 'VOICE_STARTED', body: { byUserId: userId } })
    return { taken: true as const, started: message }
  })
}

/**
 * Gives voice back when this person holds it: the quiet line says how long it was on, and why it ended when the
 * person did not end it. Null when they did not hold it.
 */
export async function releaseVoice(conversationId: string, userId: string, reason: string | null, now = new Date()): Promise<ConversationMessageView | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const row = await tx.conversation.findUnique({ where: { id: conversationId }, select: { voiceHolderId: true } })
    if (!row || row.voiceHolderId !== userId) return null
    await tx.conversation.update({ where: { id: conversationId }, data: { voiceHolderId: null } })
    const started = await tx.conversationMessage.findFirst({
      where: { conversationId, kind: 'VOICE_STARTED' }, orderBy: { seq: 'desc' }, select: { createdAt: true },
    })
    const durationSec = started ? Math.max(0, Math.round((now.getTime() - started.createdAt.getTime()) / 1000)) : undefined
    const { message } = await appendMessageIn(tx, {
      conversationId, role: 'PLATFORM', kind: 'VOICE_ENDED',
      body: { byUserId: userId, ...(durationSec !== undefined ? { durationSec } : {}), ...(reason ? { reason } : {}) },
    })
    return message
  })
}

/** At hq's start no browser is connected, so nobody can be holding voice: each holder is let go, with its line. */
export async function clearVoiceHolders(): Promise<{ conversationId: string; message: ConversationMessageView }[]> {
  const held = await prisma.conversation.findMany({ where: { voiceHolderId: { not: null } }, select: { id: true, voiceHolderId: true } })
  const ended: { conversationId: string; message: ConversationMessageView }[] = []
  for (const c of held) {
    const message = await releaseVoice(c.id, c.voiceHolderId!, HQ_RESTARTED_VOICE)
    if (message) ended.push({ conversationId: c.id, message })
  }
  return ended
}
