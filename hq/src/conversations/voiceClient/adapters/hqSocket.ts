/**
 * hq's socket as voice uses it: the conversation room's events in, and what voice tells hq out — that it starts or
 * ends, that the person cut the reply short, that they are still speaking, that their words join the message just
 * sent, and that a raised hand is invited.
 */
import {
  CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V,
  type ConversationDeltaEvent, type ConversationOperationEvent, type ConversationTurnEvent,
  type VoiceAudioEvent, type VoiceEndedEvent, type VoiceErrorEvent, type VoicePhraseEvent, type VoiceSentenceEvent,
  type VoiceSilenceWarningEvent, type VoiceStateEvent, type VoiceTurnHeldEvent, type VoiceTurnSpokenEvent, type VoiceUpdateEvent,
} from '../../../shared/conversations/protocol'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP, type VoiceBackchannelSoundEvent, type VoiceHeardPrefixEvent, type VoiceLineEvent, type VoiceListenPayload } from '@agenthix/core'
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
  turnHeld: (e: VoiceTurnHeldEvent) => void
  phrase: (e: VoicePhraseEvent) => void
  silenceWarning: (e: VoiceSilenceWarningEvent) => void
  ended: (e: VoiceEndedEvent) => void
  error: (e: VoiceErrorEvent) => void
  delta: (e: ConversationDeltaEvent) => void
  turn: (e: ConversationTurnEvent) => void
  operation: (e: ConversationOperationEvent) => void
  /** A light model's line (adaptive voice listening). */
  line?: (e: VoiceLineEvent) => void
  /** The lines heard that start a reply's message (adaptive voice listening). */
  heardPrefix?: (e: VoiceHeardPrefixEvent) => void
  /** A backchannel sound the page's keeper asked for (hq's own pages only). */
  sound?: (e: VoiceBackchannelSoundEvent) => void
}

/** Listens to the room's events until the returned function is called. */
export function listenToRoom(socket: LooseSocket, h: RoomHandlers): () => void {
  const handlers: Array<[string, (e: never) => void]> = [
    [V.state, h.state], [V.sentence, h.sentence], [V.audio, h.audio], [V.turnSpoken, h.turnSpoken], [V.turnHeld, h.turnHeld],
    [V.phrase, h.phrase], [V.silenceWarning, h.silenceWarning], [V.ended, h.ended], [V.error, h.error],
    [CONVERSATION_SOCKET.delta, h.delta], [CONVERSATION_SOCKET.turn, h.turn], [CONVERSATION_SOCKET.operation, h.operation],
    ...(h.line ? [[V.line, h.line] as [string, (e: never) => void]] : []),
    ...(h.heardPrefix ? [[V.heardPrefix, h.heardPrefix] as [string, (e: never) => void]] : []),
    ...(h.sound ? [[VP.backchannelSound, h.sound] as [string, (e: never) => void]] : []),
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
    /** `heardWords`: how many words of the sentence after `heardThrough` were heard. */
    interrupt: (conversationId: string, turnId: string, heardThrough: number, heardWords = 0) =>
      socket.emit(V.interrupt, heardWords > 0 ? { conversationId, turnId, heardThrough, heardWords } : { conversationId, turnId, heardThrough }),
    activity: (conversationId: string) => socket.emit(V.activity, { conversationId }),
    invite: (conversationId: string, updateId: string) => socket.emit(V.invite, { conversationId, updateId }),
    continue: (conversationId: string, turnId: string, text: string, trailedOff = false) =>
      socket.emit(V.continue, trailedOff ? { conversationId, turnId, text, trailedOff } : { conversationId, turnId, text }),
    listen: (payload: VoiceListenPayload) => socket.emit(V.listen, payload),
    /** `skipped`: the line was dropped, never heard. */
    linePlayed: (conversationId: string, lineId: string, skipped = false) =>
      socket.emit(V.linePlayed, skipped ? { conversationId, lineId, skipped: true } : { conversationId, lineId }),
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
      /**
       * The reply hq is writing for the last message sent: the first turn heard of after it, not an earlier one's. A
       * turn hq held is one too: it has no reply, and the person's next words join its message.
       */
      let replyTurn: string | null = null
      /**
       * The reply the last words that joined the message cut, until the turn that answers it again is heard of: words
       * meanwhile join the same message, which hq follows from that reply (#28), rather than going as a message of their own.
       */
      let cutTurn: string | null = null
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
        [V.sentence, turnSeen], [V.turnHeld, turnSeen],
      ]
      for (const [event, handler] of room) deps.socket.on(event, handler as never)
      const offs = [
        runtime.subscribe(['orchestration.send'], e => {
          if (e.kind !== 'orchestration.send') return
          const conversationId = deps.conversationId()
          const joins = e.append ? replyTurn ?? cutTurn : null
          if (joins && conversationId) hq.continue(conversationId, joins, e.text, e.trailedOff)
          else if (e.append) deps.sendNew(e.text, e.trailedOff)
          cutTurn = joins
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
