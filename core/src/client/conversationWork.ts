/**
 * A conversation's work as a client reads it: how an operation ended, the activity sheet's rows, and answering an
 * approval.
 */
import type { ContextUse } from '../protocol/contextUse.js'
import type { OperationKindValue, OperationStateValue } from './conversation.js'

export type OperationOutcome = 'completed' | 'failed' | 'cancelled' | 'detached'
/** The sheet's words for a state: queued, working (running or uncertain), waiting (for approval, or scheduled). */
export type ActivityWord = 'queued' | 'working' | 'waiting' | 'failed' | 'completed' | 'cancelled'
export type ConversationApprovalAnswer = 'approve' | 'decline'

/** One row of the activity sheet: no ids or harness names on screen; `lines` are the live helper paths. */
export type OperationActivityView = {
  operationId: string
  kind: OperationKindValue
  title: string
  state: OperationStateValue
  word: ActivityWord
  /** "Shop", "your space", or a task's key. */
  boundaryName: string | null
  /** One line per live piece of work, written as a path: "Shop · Profile the image pipeline · Measure resize times". */
  lines: string[]
  /** Helpers that ended, shown as a count on the row. */
  endedHelpers: number
  /** A worker's context use, the runtime's own figure, while its work is under way; absent or null otherwise. */
  contextUse?: ContextUse | null
  canStop: boolean
  createdAt: string
  /** While it waits for the person's okay: what it wants to run and why, from its latest request. */
  request?: { what: string; reason: string; askedBy: string } | null
  /** Where its run opens on the Runs screen, once it has one. */
  runHref?: string | null
}
/** The live operations, newest first. */
export type ConversationActivity = { outstanding: number; operations: OperationActivityView[] }
export type GetConversationActivityArgs = { conversationId: string }

/** A tap on an approval card: the answer is the person's message, and the lead takes a turn on it. */
export type AnswerApprovalArgs = {
  conversationId: string
  operationId: string
  answer: ConversationApprovalAnswer
  note?: string
  clientMessageId: string
}
