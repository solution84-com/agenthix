/**
 * The voice socket events (`CONVERSATION_VOICE_SOCKET`) from a browser. Every payload comes from the browser, so
 * each is checked before it reaches anything; a listener's failure is sent back as `error` rather than left to
 * end the process.
 */
import { CONVERSATION_VOICE_SOCKET as V, type VoiceErrorEvent } from '../../shared/conversations/voice'
import { MESSAGE_MAX_CHARS } from '../../shared/conversations/protocol'
import { endVoiceFrom, interruptVoice, inviteVoice, socketGone, startVoice, voiceActivity, VoiceRefused } from './service'
import { continueVoice } from './continue'
import { demoOn } from '../../demo/demoMode'

export interface VoiceSocket {
  id: string
  data?: { user?: { id: string } }
  emit(event: string, payload: unknown): unknown
  on(event: string, listener: (payload: unknown) => void): unknown
}

interface Log { error(message: string, err: unknown): void }

const COULD_NOT = 'Voice could not do that just now. Try again.'

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= 200 ? value : null
}

function field(payload: unknown, name: string): unknown {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined
}

export function registerConversationVoice(socket: VoiceSocket, log: Log): void {
  // The demo's voice screen plays recorded lines in the browser and sends nothing here: no event is taken, so nothing
  // can take voice or reach a speech service.
  if (demoOn()) return
  function on(event: string, act: (userId: string, conversationId: string, payload: unknown) => Promise<void> | void): void {
    socket.on(event, (payload) => {
      const userId = socket.data?.user?.id
      const conversationId = idOf(field(payload, 'conversationId'))
      if (!userId || !conversationId) return
      void (async () => {
        try {
          await act(userId, conversationId, payload)
        } catch (err) {
          if (!(err instanceof VoiceRefused)) log.error(`${event} failed for ${socket.id}`, err)
          const message = err instanceof VoiceRefused ? err.message : COULD_NOT
          socket.emit(V.error, { conversationId, message } satisfies VoiceErrorEvent)
        }
      })()
    })
  }

  on(V.start, (userId, conversationId) => startVoice(socket.id, userId, conversationId))
  on(V.end, (userId, conversationId, payload) =>
    endVoiceFrom(socket.id, userId, conversationId, field(payload, 'failed') === 'speech-to-text'))
  on(V.interrupt, (userId, conversationId, payload) => {
    const turnId = idOf(field(payload, 'turnId'))
    const heardThrough = field(payload, 'heardThrough')
    if (!turnId || typeof heardThrough !== 'number' || !Number.isFinite(heardThrough)) return
    // Words heard of the next sentence: optional, as a browser before them never sends it.
    const words = field(payload, 'heardWords')
    const heardWords = typeof words === 'number' && Number.isFinite(words) && words > 0 ? words : 0
    return interruptVoice(socket.id, userId, conversationId, turnId, heardThrough, heardWords)
  })
  on(V.activity, (userId, conversationId) => voiceActivity(socket.id, userId, conversationId))
  on(V.invite, (userId, conversationId, payload) => {
    const updateId = idOf(field(payload, 'updateId'))
    if (updateId) return inviteVoice(socket.id, userId, conversationId, updateId)
  })
  on(V.continue, (userId, conversationId, payload) => {
    const turnId = idOf(field(payload, 'turnId'))
    const text = field(payload, 'text')
    if (!turnId || typeof text !== 'string' || text.length > MESSAGE_MAX_CHARS) return
    return continueVoice(socket.id, userId, conversationId, turnId, text, field(payload, 'trailedOff') === true)
  })

  socket.on('disconnect', () => {
    void socketGone(socket.id).catch(err => log.error(`Could not end voice for ${socket.id}`, err))
  })
}
