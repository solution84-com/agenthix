/**
 * hq's own voice session for the playground: the real voice client, on the app's socket with every voice and
 * conversation event under the playground's names (`playgroundSocket`), so the app's own voice never hears it and hq's
 * voice service never answers it; a speech token as voice anywhere gets one; and a message send to the playground's
 * server side, with the lead and the Adaptive voice switch the page chose; and the listening family's numbers as the
 * page's sliders have them.
 */
import { createPlayback } from '../playback'
import { createVoiceSession, type LooseSocket, type VoiceSession } from '../voiceSession'
import type { VoiceOutside } from '../voiceParts'
import type { SttToken } from '../stt'
import { VOICE_SETTINGS } from '../settings'
import type { SendConversationMessageArgs } from '../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET, playgroundEvent, type PlaygroundSendAck } from '../../../shared/voicePlayground'
import type { PlaygroundSettings } from './settings'

/** What `emitWithAck` needs of socket.io's client socket. */
export type AckSocket = LooseSocket & {
  timeout: (ms: number) => { emitWithAck: (event: string, ...args: unknown[]) => Promise<unknown> }
}

export const SEND_TIMEOUT_MS = 10_000

/** The socket as the voice client uses it, every event under the playground's name. */
export function playgroundSocket(socket: LooseSocket): LooseSocket {
  return {
    on: (event, handler) => socket.on(playgroundEvent(event), handler),
    off: (event, handler) => socket.off(playgroundEvent(event), handler),
    emit: (event, ...args) => socket.emit(playgroundEvent(event), ...args),
  }
}

export async function sendToPlayground(socket: AckSocket, settings: PlaygroundSettings, args: SendConversationMessageArgs): Promise<void> {
  const { lead, adaptiveVoice } = settings.get()
  const ack = await socket.timeout(SEND_TIMEOUT_MS).emitWithAck(VOICE_PLAYGROUND_SOCKET.send, { ...args, lead, adaptiveVoice }) as PlaygroundSendAck
  if (!ack.ok) throw new Error(ack.error)
}

export interface PlaygroundSessionDeps {
  socket: AckSocket
  userId: string
  settings: PlaygroundSettings
  getToken: () => Promise<SttToken>
  outside?: VoiceOutside
}

export function makePlaygroundSession(deps: PlaygroundSessionDeps): VoiceSession {
  return createVoiceSession({
    socket: playgroundSocket(deps.socket),
    userId: deps.userId,
    createPlayback: () => createPlayback(),
    getToken: () => deps.getToken(),
    sendMessage: args => sendToPlayground(deps.socket, deps.settings, args),
    adaptiveVoice: () => deps.settings.get().adaptiveVoice,
    // The sliders' object itself, so a number moved while voice is on takes effect at once.
    settings: { ...VOICE_SETTINGS, listening: deps.settings.listening() },
    ...deps.outside,
  })
}
