/**
 * Where voice's words and audio go, and where its audio comes from: the conversation's room for who holds voice
 * (everyone reading agrees), the holder's own sockets for everything spoken, and the organisation's text to
 * speech in the agent's voice.
 */
import { prisma } from 'wasp/server'
import { decryptProviderKey } from '../../server/providerService'
import { inworldTtsAdapter } from '../../voice/inworldAdapter'
import { conversationEvents, conversationRoom } from '../coordinator/events'
import { appendMessage } from '../store/messages'
import { spokenAs } from './phrases'
import { SPEECH_FAILED, type VoiceSessionDeps } from './session'
import { voiceSession } from './registry'

interface Emitter { to(room: string): { emit(event: string, payload: unknown): void } }

function io(): Emitter | undefined {
  // Set by the socket server when it starts (server/socket.ts); absent in a process with no socket server.
  return (globalThis as { __wasp_io__?: Emitter }).__wasp_io__
}

export function toRoom(conversationId: string, event: string, payload: unknown): void {
  io()?.to(conversationRoom(conversationId)).emit(event, payload)
}

/** Each socket is in a room of its own id. */
export function toSockets(socketIds: Iterable<string>, event: string, payload: unknown): void {
  for (const id of socketIds) io()?.to(id).emit(event, payload)
}

export interface AgentVoice { apiKey: string; voiceId: string; model: string }

const DEFAULT_VOICE = 'Ashley'
const DEFAULT_MODEL = 'inworld-tts-2'

/** The agent's voice on the organisation's text to speech; null when there is none to speak with. */
export async function agentVoice(agentId: string): Promise<AgentVoice | null> {
  const [provider, agent] = await Promise.all([
    prisma.provider.findFirst({ where: { service: 'tts', name: 'inworld', isEnabled: true }, select: { apiKey: true } }),
    prisma.agent.findUnique({ where: { id: agentId }, select: { voiceEnabled: true, voiceId: true, voiceTtsModel: true } }),
  ])
  const apiKey = provider ? decryptProviderKey(provider.apiKey).trim() : ''
  if (!apiKey || !agent?.voiceEnabled) return null
  return { apiKey, voiceId: agent.voiceId ?? DEFAULT_VOICE, model: agent.voiceTtsModel ?? DEFAULT_MODEL }
}

export function sessionDeps(conversationId: string, voice: AgentVoice): VoiceSessionDeps {
  return {
    synthesize: (text, signal) => inworldTtsAdapter.synthesizeStream(text, voice, signal),
    asEncouragement: text => spokenAs(text, voice),
    toHolder: (event, payload) => {
      const session = voiceSession(conversationId)
      if (session) toSockets(session.socketIds, event, payload)
    },
    speechFailed: () => {
      void appendMessage({ conversationId, role: 'PLATFORM', kind: 'NOTICE', body: { text: SPEECH_FAILED } })
        .then(({ message }) => conversationEvents.message(conversationId, message))
        .catch(() => { /* the holder was told; the line in the record is a courtesy */ })
    },
    now: () => Date.now(),
  }
}
