/**
 * The conversation layer's work and results (conversational experience, phase 2): the operation states as the
 * activity sheet words them, what an ended operation gave, and the sheet's, approvals' and deleting's arguments
 * and views. Re-exported from protocol.ts. Client-safe; `type` aliases only. What the mobile app reads of them is
 * declared in core's client protocol and re-exported here.
 */
import type { ActivityWord } from '@agenthix/core'
import type { OperationStateValue } from './protocol'

export type {
  ActivityWord, AnswerApprovalArgs, ConversationActivity, ConversationApprovalAnswer as ApprovalAnswer,
  GetConversationActivityArgs, OperationActivityView, OperationOutcome,
} from '@agenthix/core'

/**
 * The states of live work, which the work bar lists (conversation layer spec, Conversation activity, What counts).
 * Not SCHEDULED: a task set for a time completes in the turn that set it (walkthrough finding 33), and the state
 * is no longer written.
 */
export const OUTSTANDING_OPERATION_STATES = ['WAITING_FOR_APPROVAL', 'ACCEPTED', 'QUEUED', 'RUNNING', 'UNCERTAIN'] as const
export const ENDED_OPERATION_STATES = ['COMPLETED', 'FAILED', 'CANCELLED', 'DETACHED'] as const

export function activityWord(state: OperationStateValue): ActivityWord {
  switch (state) {
    case 'ACCEPTED':
    case 'QUEUED': return 'queued'
    case 'RUNNING':
    case 'UNCERTAIN': return 'working'
    case 'WAITING_FOR_APPROVAL':
    case 'SCHEDULED': return 'waiting'
    case 'FAILED': return 'failed'
    case 'COMPLETED': return 'completed'
    case 'CANCELLED':
    case 'DETACHED': return 'cancelled'
  }
}

// ── Work and results: the activity sheet, approvals, Stop, deleting (phase 2) ──

/** *View results*: the run behind a completion, fetched from its site when opened. */
export type GetOperationResultArgs = { conversationId: string; operationId: string }
export type OperationResultView = {
  title: string
  state: OperationStateValue
  summary: string | null
  stated: boolean | null
  /** The run's work, as the run screen draws it; null when the site cannot be reached or there was no run. */
  work: { steps: { text: string }[]; summary: string | null } | null
  /** Where the run's full record opens, when there is one. */
  runUrl: string | null
  /** Why the run's detail could not be fetched ("Shop's site is offline"). */
  problem: string | null
}

export type CancelOperationArgs = { conversationId: string; operationId: string }

/** What deleting a conversation stops and leaves, for the confirm (conversation layer spec, Failure, recovery). */
export type ConversationDeletePreview = {
  /** Work stopped: its runs are the conversation's. */
  stops: string[]
  /** Tasks that carry on: they are the project's. */
  leaves: string[]
  canArchive: boolean
  /** What goes that is cheap to count: its messages, and the workers' runs on the sites. */
  messages: number
  runs: number
}
export type DeleteConversationArgs = { conversationId: string }
