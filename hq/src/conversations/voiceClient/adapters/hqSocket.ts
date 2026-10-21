/**
 * hq's socket as voice uses it: the conversation room's events in, and what voice tells hq out — that it starts or
 * ends, that the person cut the reply short, that they are still speaking, that their words join the message just
 * sent, and that a raised hand is invited.
 */
import {
  CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V,
  type ConversationDeltaEvent, type ConversationOperationEvent, type ConversationTurnEvent,
  type VoiceAudioEvent, type VoiceEndedEvent, type VoiceErrorEvent, type VoicePhraseEvent, type VoiceSentenceEvent,
  type VoiceSilenceWarningEvent, type VoiceStateEvent, type VoiceTurnSpokenEvent, type VoiceUpdateEvent,
} from '../../../shared/conversations/protocol'
import type { Adapter } from '../runtime/types'

export type LooseSocket = {
  on: (event: string, handler: (...args: never[]) => void) => void
  off: (event: string, handler: (...args: never[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
}

export type RoomHandlers = {
  state: (e: VoiceStateEvent) => void
  sentence: (e: VoiceSentenceEvent) => void
  audio: (e: VoiceAudioEvent) => void
  turnSpoken: (e: VoiceTurnSpokenEvent) => void
  phrase: (e: VoicePhraseEvent) => void
  silenceWarning: (e: VoiceSilenceWarningEvent) => void
  ended: (e: VoiceEndedEvent) => void
  error: (e: VoiceErrorEvent) => void
  delta: (e: ConversationDeltaEvent) => void
  turn: (e: ConversationTurnEvent) => void
  operation: (e: ConversationOperationEvent) => void
}

/** Listens to the room's events until the returned function is called. */
export function listenToRoom(socket: LooseSocket, h: RoomHandlers): () => void {
  const handlers: Array<[string, (e: never) => void]> = [
    [V.state, h.state], [V.sentence, h.sentence], [V.audio, h.audio], [V.turnSpoken, h.turnSpoken],
    [V.phrase, h.phrase], [V.silenceWarning, h.silenceWarning], [V.ended, h.ended], [V.error, h.error],
    [CONVERSATION_SOCKET.delta, h.delta], [CONVERSATION_SOCKET.turn, h.turn], [CONVERSATION_SOCKET.operation, h.operation],
  ]
  for (const [event, handler] of handlers) socket.on(event, handler as never)
  return () => { for (const [event, handler] of handlers) socket.off(event, handler as never) }
}

export type HqVoice = ReturnType<typeof hqVoice>

export function hqVoice(socket: LooseSocket) {
  return {
    start: (conversationId: string) => socket.emit(V.start, { conversationId }),
    end: (conversationId: string, failed?: 'speech-to-text') =>
      socket.emit(V.end, failed ? { conversationId, failed } : { conversationId }),
    interrupt: (conversationId: string, turnId: string, heardThrough: number) =>
      socket.emit(V.interrupt, { conversationId, turnId, heardThrough }),
    activity: (conversationId: string) => socket.emit(V.activity, { conversationId }),
    invite: (conversationId: string, updateId: string) => socket.emit(V.invite, { conversationId, updateId }),
    continue: (conversationId: string, turnId: string, text: string, trailedOff = false) =>
      socket.emit(V.continue, trailedOff ? { conversationId, turnId, text, trailedOff } : { conversationId, turnId, text }),
  }
}

export type HqOrchestrationDeps = {
  socket: LooseSocket
  /** The conversation voice is on in now. */
  conversationId: () => string | null
  /**
   * The person's words were to join a message whose reply hq has not started yet, so there is no reply to cancel:
   * they go as a message of their own.
   */
  sendNew: (text: string, trailedOff?: boolean) => void
}

/**
 * Orchestration's side of hq's socket: an agent's raised hand (`update`) in, as `reply.update`; an invitation out
 * (`invite`); and words that join the message just sent out (`continue`), naming the reply hq is writing for it.
 */
export function hqOrchestration(deps: HqOrchestrationDeps): Adapter {
  return {
    name: 'hqOrchestration',
    start(runtime) {
      const hq = hqVoice(deps.socket)
      const mine = (e: { conversationId: string }) => e.conversationId === deps.conversationId()
      /** The reply hq is writing for the last message sent: the first turn heard of after it, not an earlier one's. */
      let replyTurn: string | null = null
      let awaitingTurn = false
      const earlier = new Set<string>()
      const update = (e: VoiceUpdateEvent) => {
        if (mine(e)) runtime.publish({ kind: 'reply.update', updateId: e.updateId, critical: e.critical, t: runtime.now() })
      }
      const turnSeen = (e: { conversationId: string; turnId: string }) => {
        if (!mine(e) || e.turnId === replyTurn) return
        if (awaitingTurn && !earlier.has(e.turnId)) { replyTurn = e.turnId; awaitingTurn = false } else earlier.add(e.turnId)
      }
      const room: Array<[string, (e: never) => void]> = [
        [V.update, update], [CONVERSATION_SOCKET.delta, turnSeen], [CONVERSATION_SOCKET.turn, turnSeen],
        [V.sentence, turnSeen],
      ]
      for (const [event, handler] of room) deps.socket.on(event, handler as never)
      const offs = [
        runtime.subscribe(['orchestration.send'], e => {
          if (e.kind !== 'orchestration.send') return
          const conversationId = deps.conversationId()
          if (e.append && conversationId && replyTurn) hq.continue(conversationId, replyTurn, e.text, e.trailedOff)
          else if (e.append) deps.sendNew(e.text, e.trailedOff)
          if (replyTurn) earlier.add(replyTurn)
          replyTurn = null
          awaitingTurn = true
        }),
        runtime.subscribe(['orchestration.handRaise'], e => {
          const conversationId = deps.conversationId()
          if (e.kind === 'orchestration.handRaise' && e.state === 'invited' && conversationId) hq.invite(conversationId, e.updateId)
        }),
      ]
      return () => {
        for (const [event, handler] of room) deps.socket.off(event, handler as never)
        for (const off of offs) off()
      }
    },
  }
}
