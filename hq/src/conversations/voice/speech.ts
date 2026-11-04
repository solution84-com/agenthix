/**
 * Where voice's words and audio go, and where its audio comes from: the conversation's room for who holds voice
 * (everyone reading agrees), the holder's own sockets for everything spoken, and the text to speech provider the
 * resolver gives, in the agent's voice.
 */
import { DEFAULT_VOICE } from '../../voice/voiceModels'
import { inworldTtsAdapter } from '../../voice/inworldAdapter'
import { speechAccess, type SpeechScope } from '../../voice/speechAccess'
import { conversationEvents, conversationRoom } from '../coordinator/events'
import { appendMessage } from '../store/messages'
import { spokenAs } from './phrases'
import { reported } from './reportedSpeech'
import { SPEECH_FAILED, type VoiceSessionDeps } from './session'
import { voiceSession } from './registry'
import { recordTts, type VoiceCallAccess } from '../../billing/sources/voice'

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

export interface AgentVoice {
  apiKey: string; voiceId: string; model: string; providerId: string
  /** What its calls are costed to; absent in tests. */
  costed?: VoiceCallAccess
}

/** The agent's voice on the text to speech provider the resolver gives it; null, with why, when none works. */
export async function agentVoice(agentId: string, scope?: SpeechScope): Promise<{ voice: AgentVoice } | { reason: string }> {
  const answer = await speechAccess('tts', agentId, scope)
  if (!answer.ok) return { reason: answer.reason }
  const { apiKey, voice, model, providerId, providerName, vendor, costing } = answer.access
  return { voice: { apiKey, voiceId: voice ?? DEFAULT_VOICE, model, providerId, costed: { providerId, providerName, vendor, model, costing } } }
}

export function sessionDeps(conversationId: string, voice: AgentVoice): VoiceSessionDeps {
  return {
    // Each call's characters go on the ledger once the speech service answers it.
    synthesize: (text, signal) => reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice, signal),
      voice.costed ? () => recordTts(voice.costed!, text.length, { conversationId }) : undefined),
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
