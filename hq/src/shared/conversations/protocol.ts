/**
 * The conversation layer's contract between hq's server and its screens (conversational experience spec):
 * what a message holds by kind, what the browser receives over the socket, and the operations' arguments and
 * answers. Client-safe — no server imports. Shapes are `type` aliases, not interfaces: Wasp's operation payloads
 * must be plain object types. What the mobile app relies on is declared in core's client protocol and re-exported
 * here; what only hq's own screens and server use is declared here.
 */

export { CONVERSATION_SOCKET, MESSAGE_MAX_CHARS, MESSAGE_PAGE_SIZE } from '@agenthix/core'
export type {
  ActionBody, ApprovalAnswerBody, ApprovalRequestBody, ConversationAgentChoicesArgs, ConversationAgentView,
  ConversationDeltaEvent, ConversationHomeValue, ConversationIdArgs, ConversationMessageEvent,
  ConversationMessageKindValue, ConversationMessageView, ConversationOperationEvent, ConversationOperationLinesEvent,
  ConversationPage, ConversationQueueStateValue, ConversationReplayEvent, ConversationRoleValue,
  ConversationStatusValue, ConversationStepsEvent, ConversationSummariseEvent, ConversationSummaryView,
  ConversationTurnEvent, ConversationView, FailedBody, GetConversationArgs, GetConversationMessagesArgs,
  GetConversationsArgs, GetModelChoicesArgs, InferenceTurnStateValue, MessageBodyByKind, ModelChoice, ModelChoices,
  NoticeBody, OperationKindValue, OperationStartedBody, OperationStateValue, ReplyStepView, ReplyThinking, ResultBody,
  SendConversationMessageArgs, SendConversationMessageResult, SetConversationModelArgs, StartConversationArgs,
  StartConversationResult, SummarisedBody, TaskBody, TextBody, VoiceBody, WaitingMessageArgs,
} from '@agenthix/core'
import type { ConversationAgentView } from '@agenthix/core'

/** How long a turn waits for a foreground tool before the call is detached and finishes on its own. */
export const WAIT_LIMIT_MS = 4_000
/** How much of one tool result the lead receives, in characters; over it the lead is told to brief a worker. */
export const RESULT_CAP_CHARS = 16_000
export const RESULT_TOO_LARGE = 'too large for the conversation; brief a worker'

export * from './work'
export * from './voice'
export * from './long'
export * from './runEvents'
export * from './screen'

// ── The ledger and continuation (long conversations spec; workers and results spec) ──

export type LedgerEntryKind = 'decision' | 'approval' | 'open-operation' | 'obligation' | 'keep'
export type LedgerEntry = {
  id: string
  kind: LedgerEntryKind
  text: string
  /** The message or operation it came from. */
  sourceSeq?: number
  operationId?: string
  at: string
}

/** What an operation may continue with when it completes: the next step of a sequence a person authorised. */
export type ContinuationObligation = {
  authorisedById: string
  authorisingTurnId: string
  nextStep: string
  depth: number
}
/** The most automatic continuation turns one authorised sequence may take, and how deep it may go. */
export const CONTINUATION_MAX_DEPTH = 3

/** What an ended operation gave (Operation.resultSummary, encrypted JSON). */
export type OperationResult = {
  summary: string
  /** False when a run ended without stating its result; the summary is then its last words. */
  stated?: boolean
  taskState?: string
  /** The run that completed it, for *View results*. */
  runId?: string
}

export type PrimaryAgentView = { agent: ConversationAgentView; isDefault: boolean }
export type SetPrimaryAgentArgs = { agentId: string | null }
