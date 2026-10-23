/**
 * Voice in a conversation (conversational experience spec, Voice): taking it, ending it, being spoken over,
 * inviting an agent's raised hand, and the person's speech keeping it alive. Anyone who may speak in the conversation may take voice when its agent
 * has a voice, the organisation has speech to text and text to speech, and a model access serves a reply — one
 * person at a time. Every end writes its quiet line and tells the room; the holder's sockets are told why.
 */
import { HttpError, prisma } from 'wasp/server'
import {
  CONVERSATION_VOICE_SOCKET as V,
  type VoiceEndedEvent,
  type VoicePhraseEvent,
  type VoiceStateEvent,
} from '../../shared/conversations/voice'
import { requireConversationSpeaker } from '../readingRule'
import { accessState } from '../conversationQueries'
import { conversationEvents } from '../coordinator/events'
import { liveTurn, stopLive } from '../coordinator/liveTurns'
import { scheduleConversation } from '../coordinator/scheduler'
import { requestStop } from '../coordinator/turnRecord'
import { keepHeardText, toMessageView } from '../store/messages'
import { loadVoiceFacts, inUse, voiceRefusal, voiceStartedAt } from './availability'
import { clearVoiceHolders, releaseVoice, takeVoice } from './holder'
import { closeVoiceSession, openVoiceSession, sessionsOfSocket, voiceSession, whenSilent } from './registry'
import { heardText } from './speechUnits'
import type { VoiceSession } from './session'
import { agentVoice, sessionDeps, toRoom, toSockets } from './speech'
import { phraseClips } from './phrases'
import { personName } from '../../sessions/transcriptAuthors'

/** Why voice ended, in a line the person reads. */
export const ENDED = {
  byPerson: 'Voice ended.',
  silence: 'Voice ended after two minutes of quiet.',
  speechToText: 'Voice ended because speech to text stopped working. You can keep typing.',
  pageClosed: 'Voice ended when the page was closed.',
} as const

/** A refusal the person reads, sent back to the socket that asked. */
export class VoiceRefused extends Error {}

function state(conversationId: string, holderId: string | null, startedAt: Date | null): void {
  const event: VoiceStateEvent = { conversationId, holderId, startedAt: startedAt?.toISOString() ?? null }
  toRoom(conversationId, V.state, event)
}

export async function startVoice(socketId: string, userId: string, conversationId: string): Promise<void> {
  let ref
  try {
    ref = await requireConversationSpeaker(conversationId, userId)
  } catch (err) {
    throw new VoiceRefused(err instanceof HttpError && err.statusCode === 409 ? err.message : 'Conversation not found')
  }
  const row = await prisma.conversation.findUniqueOrThrow({
    where: { id: ref.id }, select: { id: true, voiceHolderId: true },
  })
  const { accessProblem } = await accessState(ref, userId)
  const facts = await loadVoiceFacts({ agentId: ref.agentId, holderId: row.voiceHolderId, speakingRefusal: null, accessProblem })
  const refusal = voiceRefusal(facts, userId)
  if (refusal) throw new VoiceRefused(refusal)
  const spoken = await agentVoice(ref.agentId!)
  if (!('voice' in spoken)) throw new VoiceRefused(spoken.reason)
  const voice = spoken.voice

  const taken = await takeVoice(ref.id, userId)
  if (!taken.taken) throw new VoiceRefused(inUse((await personName(taken.holderId)) ?? 'Someone else'))
  const id = ref.id
  const session = openVoiceSession(id, userId, socketId, { ...sessionDeps(id, voice), handExpired: () => scheduleConversation(id) })
  // Another tab of theirs joining sees a hand already raised.
  session.hand.tell()
  void phraseClips(voice, ({ text, tier, audio, use }) => {
    const event: VoicePhraseEvent = { conversationId: id, text, tier, audio, use }
    toSockets([socketId], V.phrase, event)
  }, () => voiceSession(id) === session).catch(() => undefined)
  if (taken.started) conversationEvents.message(ref.id, taken.started)
  state(ref.id, userId, taken.started ? new Date(taken.started.createdAt) : await voiceStartedAt(ref.id))
}

/**
 * Ends voice held by this person: nothing more is spoken (a turn running finishes as text), the quiet line is
 * written, and the room told. `reason` is the line's why, null when the person ended it. An update waiting with
 * its hand raised then takes its turn, as text.
 */
export async function endVoice(conversationId: string, userId: string, line: string, reason: string | null): Promise<void> {
  const session = voiceSession(conversationId)
  if (session && session.holderId === userId) closeVoiceSession(conversationId)
  const message = await releaseVoice(conversationId, userId, reason)
  if (!message && !session) return
  if (message) conversationEvents.message(conversationId, message)
  state(conversationId, null, null)
  if (session && session.holderId === userId) {
    const event: VoiceEndedEvent = { conversationId, reason: line }
    toSockets(session.socketIds, V.ended, event)
    scheduleConversation(conversationId)
  }
}

/** Only a socket that holds voice in the conversation acts on it. */
export function heldBy(socketId: string, userId: string, conversationId: string) {
  const session = voiceSession(conversationId)
  return session && session.holderId === userId && session.socketIds.has(socketId) ? session : null
}

export async function endVoiceFrom(socketId: string, userId: string, conversationId: string, failed: boolean): Promise<void> {
  if (!heldBy(socketId, userId, conversationId)) return
  await endVoice(conversationId, userId, failed ? ENDED.speechToText : ENDED.byPerson, failed ? ENDED.speechToText : null)
}

/**
 * The person spoke over the reply: every sentence stops, and the turn keeps only what they heard — stopped where
 * it runs if it is still running, or cut in the record if it had already been written. Voice stays up.
 */
export async function interruptVoice(socketId: string, userId: string, conversationId: string, turnId: string, heardThrough: number): Promise<void> {
  const session = heldBy(socketId, userId, conversationId)
  if (session) await cancelReply(session, conversationId, turnId, heardThrough)
}

/** Stops a reply, and keeps in the record only what was heard of it: none of it when `heardThrough` is -1. */
export async function cancelReply(
  session: VoiceSession, conversationId: string, turnId: string, heardThrough: number, withdrawn = false,
): Promise<void> {
  session.interrupt(turnId, heardThrough, withdrawn)
  if (liveTurn(conversationId)?.turnId === turnId) {
    stopLive(conversationId, 'interrupt')
    return
  }
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { activeTurnId: true } })
  if (conversation?.activeTurnId === turnId) {
    await requestStop(turnId)
    return
  }
  // Only a reply this voice spoke is cut: what the person heard of any other is not known.
  const heard = session.heardThrough(turnId)
  if (heard === undefined) return
  const row = await prisma.conversationMessage.findFirst({ where: { conversationId, turnId, role: 'AGENT', kind: 'TEXT' } })
  if (!row) return
  const message = toMessageView(row)
  if (message.kind !== 'TEXT') return
  const kept = heardText(message.body.text, heard)
  if (kept === message.body.text && !withdrawn) return
  conversationEvents.messageUpdated(conversationId, await keepHeardText(row.id, kept, withdrawn))
}

/** The holder invited the agent's raised hand: its update takes its turn, after any message of theirs. */
export function inviteVoice(socketId: string, userId: string, conversationId: string, updateId: string): void {
  if (heldBy(socketId, userId, conversationId)?.hand.invite(updateId)) scheduleConversation(conversationId)
}

export function voiceActivity(socketId: string, userId: string, conversationId: string): void {
  heldBy(socketId, userId, conversationId)?.activity()
}

/** A closed tab ends voice: the holder's last socket went. */
export async function socketGone(socketId: string): Promise<void> {
  for (const session of sessionsOfSocket(socketId)) {
    session.socketIds.delete(socketId)
    if (session.socketIds.size === 0) await endVoice(session.conversationId, session.holderId, ENDED.pageClosed, ENDED.pageClosed)
  }
}

/** At the socket server's start: nobody holds voice yet, and the silence rule ends voice through endVoice. */
export async function startConversationVoice(log: { error(message: string, err: unknown): void }): Promise<void> {
  whenSilent((conversationId, holderId) => {
    void endVoice(conversationId, holderId, ENDED.silence, ENDED.silence).catch(err => log.error('Could not end voice after silence', err))
  })
  for (const { conversationId, message } of await clearVoiceHolders()) {
    conversationEvents.message(conversationId, message)
  }
}
