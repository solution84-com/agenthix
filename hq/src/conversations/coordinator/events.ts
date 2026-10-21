/**
 * What the coordinator tells the screens, in the conversation's socket room `conversation:<id>`, by the names
 * and shapes protocol.ts gives them. The room is joined only after the reading rule (socketRoom.ts), so
 * everything sent here reaches only people who may read the conversation.
 */
import {
  CONVERSATION_SOCKET,
  type ConversationDeltaEvent,
  type ConversationMessageEvent,
  type ConversationMessageView,
  type ConversationOperationEvent,
  type ConversationOperationLinesEvent,
  type ConversationStepsEvent,
  type ConversationSummariseEvent,
  type ConversationTurnEvent,
} from '../../shared/conversations/protocol'

export interface ConversationEvents {
  message(conversationId: string, message: ConversationMessageView): void
  messageUpdated(conversationId: string, message: ConversationMessageView): void
  delta(event: ConversationDeltaEvent): void
  turn(event: ConversationTurnEvent): void
  operation(event: ConversationOperationEvent): void
  operationLines(event: ConversationOperationLinesEvent): void
  /** The running reply's steps; a sink that shows no screen may leave it out. */
  steps?(event: ConversationStepsEvent): void
  /** *Summarise now*'s progress; a sink that shows no screen may leave it out. */
  summarise?(event: ConversationSummariseEvent): void
}

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`
}

interface RoomEmitter {
  to(room: string): { emit(event: string, payload: unknown): void }
}

function io(): RoomEmitter | undefined {
  // Set by the socket server when it starts (server/socket.ts); absent in a process with no socket server.
  return (globalThis as { __wasp_io__?: RoomEmitter }).__wasp_io__
}

function send(conversationId: string, event: string, payload: unknown): void {
  io()?.to(conversationRoom(conversationId)).emit(event, payload)
}

export const conversationEvents: ConversationEvents = {
  message(conversationId, message) {
    const event: ConversationMessageEvent = { conversationId, message }
    send(conversationId, CONVERSATION_SOCKET.message, event)
  },
  messageUpdated(conversationId, message) {
    const event: ConversationMessageEvent = { conversationId, message }
    send(conversationId, CONVERSATION_SOCKET.messageUpdated, event)
  },
  delta(event) {
    send(event.conversationId, CONVERSATION_SOCKET.delta, event)
  },
  turn(event) {
    send(event.conversationId, CONVERSATION_SOCKET.turn, event)
  },
  operation(event) {
    send(event.conversationId, CONVERSATION_SOCKET.operation, event)
  },
  operationLines(event) {
    send(event.conversationId, CONVERSATION_SOCKET.operationLines, event)
  },
  steps(event) {
    send(event.conversationId, CONVERSATION_SOCKET.steps, event)
  },
  summarise(event) {
    send(event.conversationId, CONVERSATION_SOCKET.summarise, event)
  },
}
