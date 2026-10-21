/**
 * Whether a person may start voice in a conversation now, and why not (conversational experience spec, Voice ›
 * The message box): they may speak in it, its agent has a voice, the organisation has speech to text and text to
 * speech, a model access serves a reply, and nobody else holds voice in it. The reason is what the greyed button
 * says. Speech providers are the organisation's settings, outside the model policy.
 */
import { prisma } from 'wasp/server'
import type { ConversationVoiceView } from '../../shared/conversations/voice'
import { personName } from '../../sessions/transcriptAuthors'

export interface VoiceFacts {
  /** Why the person may not speak in the conversation now; null when they may. */
  speakingRefusal: string | null
  agent: { name: string; voiceEnabled: boolean } | null
  hasSpeechToText: boolean
  hasTextToSpeech: boolean
  /** Why no model access serves a reply here; null when one does. */
  accessProblem: string | null
  holder: { id: string; name: string } | null
}

export const NO_SPEECH_TO_TEXT = 'Voice needs speech to text, which HQ does not have yet. An admin can add it in Settings › Voice.'
export const NO_TEXT_TO_SPEECH = 'Voice needs text to speech, which HQ does not have yet. An admin can add it in Settings › Voice.'
export const NO_AGENT = "This conversation's agent no longer exists."

export function inUse(holderName: string): string {
  return `${holderName} is using voice in this conversation. One person talks at a time.`
}

/** Why voice cannot start for this person; null when it can. */
export function voiceRefusal(facts: VoiceFacts, userId: string): string | null {
  if (facts.speakingRefusal) return facts.speakingRefusal
  if (!facts.agent) return NO_AGENT
  if (!facts.agent.voiceEnabled) return `${facts.agent.name} has no voice yet. An admin can turn it on in the agent's settings.`
  if (!facts.hasSpeechToText) return NO_SPEECH_TO_TEXT
  if (!facts.hasTextToSpeech) return NO_TEXT_TO_SPEECH
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

async function enabledProvider(service: 'stt' | 'tts', name: string): Promise<boolean> {
  return (await prisma.provider.count({ where: { service, name, isEnabled: true } })) > 0
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
  const [agent, hasSpeechToText, hasTextToSpeech, holderName] = await Promise.all([
    input.agentId ? prisma.agent.findUnique({ where: { id: input.agentId }, select: { name: true, voiceEnabled: true } }) : null,
    enabledProvider('stt', 'assemblyai'),
    enabledProvider('tts', 'inworld'),
    input.holderId ? nameOfHolder(input.holderId) : null,
  ])
  return {
    speakingRefusal: input.speakingRefusal,
    agent,
    hasSpeechToText,
    hasTextToSpeech,
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
