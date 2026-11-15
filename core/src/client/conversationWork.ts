/**
 * A conversation's work as a client reads it: how an operation ended, the activity sheet's rows, and answering an
 * approval.
 */
import type { ContextUse } from '../protocol/contextUse.js'
import type { OperationKindValue, OperationStateValue, WorkflowApprovalCard } from './conversation.js'

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
  /**
   * While it waits: a workflow version's approval card. `canAnswer` is whether the viewer administers the
   * workflow's place, the only people its buttons are for.
   */
  workflowCard?: (WorkflowApprovalCard & { canAnswer: boolean }) | null
  /**
   * While it waits: an agent's ask to merge its branch into `main`, answered *Merge* or *Not now* (approve
   * or decline). `canAnswer` is whether the viewer may merge there: a Member or Admin of the project, or the person
   * whose own storage it is.
   */
  mergeCard?: MergeApprovalCard | null
  /**
   * While it waits: an agent's ask to let a package whose install script the rule blocked run it in its
   * branch's copy, with no live preview open (adr-0170), answered *Allow* or *Not now*. `canAnswer` as for `mergeCard`.
   */
  packageCard?: PackageApprovalCard | null
  /** Where its run opens on the Runs screen, once it has one. */
  runHref?: string | null
}
/** An agent's ask to merge its branch: which workspace and branch, for the link to the workspace view. */
export type MergeApprovalCard = { workspaceId: string; branch: string; main: string; agentName: string; canAnswer: boolean }

/** An agent's ask about a blocked package: HQ's question, which names the package and its risk in plain words. */
export type PackageApprovalCard = {
  workspaceId: string
  branch: string
  name: string
  version: string
  question: string
  agentName: string
  canAnswer: boolean
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
