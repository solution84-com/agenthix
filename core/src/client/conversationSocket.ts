/**
 * A conversation's socket.io room, `conversation:<id>`: the names a client joins it and listens by, and what each
 * event carries.
 */
import type {
  ConversationMessageView, InferenceTurnStateValue, OperationStateValue, ReplyStepView,
} from './conversation.js'

export const CONVERSATION_SOCKET = {
  /** Client → server: join a conversation's room, after the reading rule. */
  subscribe: 'subscribeToConversation',
  unsubscribe: 'unsubscribeFromConversation',
  /** A message committed to the record: admitted, a reply finished, a card. */
  message: 'conversation:message',
  /** A message changed: taken from the queue, cancelled, marked interrupted. */
  messageUpdated: 'conversation:messageUpdated',
  /** Text streamed by the running turn. */
  delta: 'conversation:delta',
  /** *Summarise now*: it started, ended (its SUMMARISED message is in the record), or failed, and why. */
  summarise: 'conversation:summarise',
  /** On joining: what the running turn has streamed so far, so a reconnect loses nothing. */
  replay: 'conversation:replay',
  /** A turn's state changed. */
  turn: 'conversation:turn',
  /** The running turn's steps so far, each time one starts or ends. */
  steps: 'conversation:steps',
  /** An operation's state changed (activity indicator and sheet). */
  operation: 'conversation:operation',
  /** An operation's live helper lines changed (activity sheet). */
  operationLines: 'conversation:operationLines',
} as const

/** What `subscribe` and `unsubscribe` send: the conversation's id, as a plain string. */
export type ConversationRoomArg = string

export type ConversationDeltaEvent = {
  conversationId: string
  turnId: string
  /** The characters already streamed before this text, so a client can drop what it has seen. */
  offset: number
  text: string
}
/** The running reply's steps; `elapsedMs` is how long it has worked when sent, so a screen counts on from there. */
export type ConversationStepsEvent = { conversationId: string; turnId: string; elapsedMs: number; steps: ReplyStepView[] }
/** *Summarise now* runs apart from the request that asked for it (walkthrough finding 36); `reason` when it failed. */
export type ConversationSummariseEvent = { conversationId: string; state: 'started' | 'ended' | 'failed'; reason?: string }
export type ConversationReplayEvent = {
  conversationId: string
  turnId: string
  text: string
  /** Its steps so far, once it has taken one. */
  steps?: { elapsedMs: number; steps: ReplyStepView[] }
}
export type ConversationMessageEvent = { conversationId: string; message: ConversationMessageView }
export type ConversationTurnEvent = {
  conversationId: string
  turnId: string
  state: InferenceTurnStateValue
  /** On FAILED, the reason; the FAILED message carries it in the record too. */
  error?: string
}
export type ConversationOperationEvent = {
  conversationId: string
  operationId: string
  state: OperationStateValue
  title: string
  /** The conversation's outstanding operations after this change, for the indicator. */
  outstanding?: number
}
export type ConversationOperationLinesEvent = {
  conversationId: string
  operationId: string
  lines: string[]
  endedHelpers: number
}
