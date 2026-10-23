/**
 * Where voice's words and audio go, and where its audio comes from: the conversation's room for who holds voice
 * (everyone reading agrees), the holder's own sockets for everything spoken, and the text to speech provider the
 * resolver gives, in the agent's voice.
 */
import { reportCall } from '../../routing/resolver'
import { inworldTtsAdapter } from '../../voice/inworldAdapter'
import { failureKind, speechAccess } from '../../voice/speechAccess'
import type { WordTiming } from '../../voice/ttsAdapter'
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

export interface AgentVoice { apiKey: string; voiceId: string; model: string; providerId: string }

const DEFAULT_VOICE = 'Ashley'

/** The agent's voice on the text to speech provider the resolver gives it; null, with why, when none works. */
export async function agentVoice(agentId: string): Promise<{ voice: AgentVoice } | { reason: string }> {
  const answer = await speechAccess('tts', agentId)
  if (!answer.ok) return { reason: answer.reason }
  const { apiKey, voice, model, providerId } = answer.access
  return { voice: { apiKey, voiceId: voice ?? DEFAULT_VOICE, model, providerId } }
}

/** Speech from the provider, its outcome reported to the provider's health as it ends. */
async function* reported(providerId: string, speech: AsyncIterable<{ audio: Buffer; wordTiming?: WordTiming }>) {
  try {
    yield* speech
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reportCall(providerId, failureKind(null, message), message.slice(0, 200))
    throw err
  }
  reportCall(providerId, null)
}

export function sessionDeps(conversationId: string, voice: AgentVoice): VoiceSessionDeps {
  return {
    synthesize: (text, signal) => reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice, signal)),
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
