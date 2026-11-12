/**
 * Whether a person may start voice in a conversation now, and why not (conversational experience spec, Voice ›
 * The message box): they may speak in it, its agent has a voice, the organisation has speech to text and text to
 * speech, a model access serves a reply, and nobody else holds voice in it. The reason is what the greyed button
 * says. Every agent has a voice (models from one place, part 4): speech to text and text to speech are resolved like
 * a model, and when no provider of a type works the button stays and says voice is down.
 */
import { prisma } from 'wasp/server'
import type { ConversationVoiceView } from '../../shared/conversations/voice'
import { personName } from '../../sessions/transcriptAuthors'
import { speechAccess, type SpeechKind } from '../../voice/speechAccess'
import { demoOn } from '../../demo/demoMode'

export interface VoiceFacts {
  /** Why the person may not speak in the conversation now; null when they may. */
  speakingRefusal: string | null
  agent: { name: string } | null
  /** Why no speech to text / text to speech provider serves this agent now; null when one does. */
  speechToTextDown: string | null
  textToSpeechDown: string | null
  /** Why no model access serves a reply here; null when one does. */
  accessProblem: string | null
  holder: { id: string; name: string } | null
}

export const NO_AGENT = "This conversation's agent no longer exists."

export function inUse(holderName: string): string {
  return `${holderName} is using voice in this conversation. One person talks at a time.`
}

/** Why voice cannot start for this person; null when it can. */
export function voiceRefusal(facts: VoiceFacts, userId: string): string | null {
  if (facts.speakingRefusal) return facts.speakingRefusal
  if (!facts.agent) return NO_AGENT
  // The demo's voice plays recorded lines: no speech service, model access or other holder stands in the way.
  if (demoOn()) return null
  if (facts.speechToTextDown) return facts.speechToTextDown
  if (facts.textToSpeechDown) return facts.textToSpeechDown
  if (facts.accessProblem) return facts.accessProblem
  if (facts.holder && facts.holder.id !== userId) return inUse(facts.holder.name)
  return null
}

export function voiceView(facts: VoiceFacts, userId: string, startedAt: Date | null): ConversationVoiceView {
  const reason = voiceRefusal(facts, userId)
  return {
    available: reason === null,
    unavailableReason: reason,
    holderId: facts.holder?.id ?? null,
    startedAt: facts.holder && startedAt ? startedAt.toISOString() : null,
  }
}

async function downReason(kind: SpeechKind, agentId: string | null): Promise<string | null> {
  const answer = await speechAccess(kind, agentId)
  return answer.ok ? null : answer.reason
}

async function nameOfHolder(userId: string): Promise<string> {
  return (await personName(userId)) ?? 'Someone else'
}

/** The facts that do not depend on who asks or on the conversation's access, read once per view. */
export async function loadVoiceFacts(input: {
  agentId: string | null
  holderId: string | null
  speakingRefusal: string | null
  accessProblem: string | null
}): Promise<VoiceFacts> {
  const [agent, speechToTextDown, textToSpeechDown, holderName] = await Promise.all([
    input.agentId ? prisma.agent.findUnique({ where: { id: input.agentId }, select: { name: true } }) : null,
    downReason('stt', input.agentId),
    downReason('tts', input.agentId),
    input.holderId ? nameOfHolder(input.holderId) : null,
  ])
  return {
    speakingRefusal: input.speakingRefusal,
    agent,
    speechToTextDown,
    textToSpeechDown,
    accessProblem: input.accessProblem,
    holder: input.holderId ? { id: input.holderId, name: holderName! } : null,
  }
}

/** When the holder took voice: the latest quiet line saying it started. */
export async function voiceStartedAt(conversationId: string): Promise<Date | null> {
  const row = await prisma.conversationMessage.findFirst({
    where: { conversationId, kind: 'VOICE_STARTED' },
    orderBy: { seq: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}
