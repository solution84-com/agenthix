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
import { scopeOfConversation } from '../../voice/speechScope'
import { accessState } from '../conversationQueries'
import { conversationEvents } from '../coordinator/events'
import { liveTurn, stopLive } from '../coordinator/liveTurns'
import { scheduleConversation } from '../coordinator/scheduler'
import { requestStop } from '../coordinator/turnRecord'
import { keepHeardText, toMessageView } from '../store/messages'
import { loadVoiceFacts, inUse, voiceRefusal, voiceStartedAt } from './availability'
import { clearVoiceHolders, releaseVoice, takeVoice } from './holder'
import { allVoiceSessions, closeVoiceSession, openVoiceSession, sessionsOfSocket, voiceSession, whenSilent } from './registry'
import type { VoiceSession } from './session'
import { agentVoice, sessionDeps, toRoom, toSockets } from './speech'
import { phraseClips } from './phrases'
import { personName } from '../../sessions/transcriptAuthors'
import { demoOn } from '../../demo/demoMode'
import { DEMO_NO_VOICE } from '../../voice/demoNoVendor'

/** Why voice ended, in a line the person reads. */
export const ENDED = {
  byPerson: 'Voice ended.',
  silence: 'Voice ended after two minutes of quiet.',
  speechToText: 'Voice ended because speech to text stopped working. You can keep typing.',
  pageClosed: 'Voice ended when the page was closed.',
  noLongerAllowed: 'Voice ended because you can no longer speak in this conversation.',
  /** The same, as the record says it to everyone who reads the conversation. */
  noLongerAllowedRecord: 'Voice ended because the person holding it can no longer speak in this conversation.',
} as const

const NO_LONGER_HERE = 'You can no longer speak in this conversation.'

/** A refusal the person reads, sent back to the socket that asked. */
export class VoiceRefused extends Error {}

function state(conversationId: string, holderId: string | null, startedAt: Date | null): void {
  const event: VoiceStateEvent = { conversationId, holderId, startedAt: startedAt?.toISOString() ?? null }
  toRoom(conversationId, V.state, event)
}

export async function startVoice(socketId: string, userId: string, conversationId: string): Promise<void> {
  if (demoOn()) throw new VoiceRefused(DEMO_NO_VOICE)
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
  const spoken = await agentVoice(ref.agentId!, await scopeOfConversation(ref, userId))
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
 * Ends voice held by this person: nothing more is spoken (a turn running finishes as text, unless the browser
 * stopped it first at what was heard, as it does when the person presses End: interruptVoice), the quiet line is
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

/** Why this person may not speak in the conversation now, null when they may. A failure that is not a refusal is thrown. */
async function speakingRefusal(conversationId: string, userId: string): Promise<string | null> {
  try {
    await requireConversationSpeaker(conversationId, userId)
    return null
  } catch (err) {
    if (!(err instanceof HttpError) || err.statusCode < 400 || err.statusCode >= 500) throw err
    return err.statusCode === 409 ? err.message : NO_LONGER_HERE
  }
}

/**
 * The holder's voice, for an action that writes or steers: the speaking rule is checked again each time, as it was
 * when voice was taken. A holder who may no longer speak here loses voice, and is told why.
 */
export async function heldBySpeaker(socketId: string, userId: string, conversationId: string): Promise<VoiceSession | null> {
  if (!heldBy(socketId, userId, conversationId)) return null
  await stillSpeaker(conversationId, userId)
  return heldBy(socketId, userId, conversationId)
}

/** A holder who may no longer speak here loses voice, and is told why. */
async function stillSpeaker(conversationId: string, userId: string): Promise<void> {
  const refusal = await speakingRefusal(conversationId, userId)
  if (refusal !== null) {
    await endVoice(conversationId, userId, ENDED.noLongerAllowed, ENDED.noLongerAllowedRecord)
    throw new VoiceRefused(`${refusal} Voice ended. Nothing was changed.`)
  }
}

/**
 * Ends voice held by anyone — or, with `userIds`, by these people — who may no longer speak where they hold it. Called
 * after each change that may end someone's access, and on the room sweep. A check that cannot answer leaves that
 * voice as it is, for the next. Never throws.
 */
export async function endVoiceNoLongerAllowed(userIds?: Iterable<string>): Promise<void> {
  const only = userIds ? new Set(userIds) : null
  for (const { conversationId, holderId } of allVoiceSessions()) {
    if (only && !only.has(holderId)) continue
    try {
      if ((await speakingRefusal(conversationId, holderId)) !== null) {
        await endVoice(conversationId, holderId, ENDED.noLongerAllowed, ENDED.noLongerAllowedRecord)
      }
    } catch {
      // The database did not answer: the next change or sweep checks again.
    }
  }
}

export async function endVoiceFrom(socketId: string, userId: string, conversationId: string, failed: boolean): Promise<void> {
  if (!heldBy(socketId, userId, conversationId)) return
  await endVoice(conversationId, userId, failed ? ENDED.speechToText : ENDED.byPerson, failed ? ENDED.speechToText : null)
}

/**
 * The person spoke over the reply, or ended the call during it: every sentence stops, and the turn keeps only what
 * they heard — the sentences through `heardThrough` and `heardWords` words of the next — stopped where it runs if it
 * is still running, or cut in the record if it had already been written. Only a reply this voice speaks is cut.
 *
 * The session is taken before the speaking rule is checked again: the browser sends End right after this when the
 * call ended, and what was heard still counts once End has closed the session.
 */
export async function interruptVoice(
  socketId: string, userId: string, conversationId: string, turnId: string, heardThrough: number, heardWords = 0,
): Promise<void> {
  const session = heldBy(socketId, userId, conversationId)
  if (!session) return
  await stillSpeaker(conversationId, userId)
  if (session.spoke(turnId)) await cancelReply(session, conversationId, turnId, heardThrough, false, heardWords)
}

/** Stops a reply, and keeps in the record only what was heard of it: none of it when `heardThrough` is -1. */
export async function cancelReply(
  session: VoiceSession, conversationId: string, turnId: string, heardThrough: number, withdrawn = false, heardWords = 0,
): Promise<void> {
  session.interrupt(turnId, heardThrough, withdrawn, heardWords)
  // A turn still speaking keeps only what was heard as it ends (session.ts, `end`).
  if (liveTurn(conversationId)?.turnId === turnId) {
    stopLive(conversationId, 'interrupt')
    if (!session.spoke(turnId)) return
  } else if (!session.spoke(turnId)) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { activeTurnId: true } })
    if (conversation?.activeTurnId === turnId) await requestStop(turnId)
    return
  }
  // A turn whose speech had ended before this reached it: its record is cut once it is written.
  const messageId = await session.toCut(turnId)
  if (!messageId) return
  const row = await prisma.conversationMessage.findFirst({ where: { id: messageId, conversationId, role: 'AGENT', kind: 'TEXT' } })
  if (!row) return
  const message = toMessageView(row)
  if (message.kind !== 'TEXT') return
  const kept = session.cutOf(turnId, message.body.text)
  if (kept === undefined || (kept === message.body.text && !withdrawn)) return
  conversationEvents.messageUpdated(conversationId, await keepHeardText(row.id, kept, withdrawn))
}

/** The holder invited the agent's raised hand: its update takes its turn, after any message of theirs. */
export async function inviteVoice(socketId: string, userId: string, conversationId: string, updateId: string): Promise<void> {
  if ((await heldBySpeaker(socketId, userId, conversationId))?.hand.invite(updateId)) scheduleConversation(conversationId)
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
