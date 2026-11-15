/**
 * A task's session as a client reads it from hq (`getTaskSession`): the session's own fields, its whole record in
 * reading order with what hq adds to the site's rows — who sent each message, an approval's answer in plain words,
 * who asked for a summary — the record's facts, and its runs with what started each. The record's times and the
 * runs' are ISO strings, as the site sends them; the session's own dates are `Date`, as superjson carries them.
 */
import type { ApprovalAnswer, ApprovalItem } from '../protocol/approvalWording.js'
import type { ContextUse } from '../protocol/contextUse.js'
import type { LatestFailure } from '../protocol/conversationOrder.js'
import type { RunRow, TokenUsage } from '../protocol/runtimeData.js'
import type { SessionClosedReasonValue, SessionStatusValue } from '../protocol/sessionState.js'
import type { WorkspaceOwnerType } from '../protocol/siteData.js'
import type { JsonValue } from './json.js'
import type {
  ContextSummarisedDetail, RunFailedDetail, RunStoppedDetail, TranscriptEntryKind, TranscriptRow,
} from '../protocol/transcript.js'

/** A request for approval, as the conversation and Notifications word it. */
export type ApprovalCard = {
  answer: ApprovalAnswer
  items: ApprovalItem[]
  /** Who answered, by name; null when it was the viewer, nobody, or not recorded. */
  decidedBy: string | null
  decidedByYou: boolean
  /** When it was approved, denied or replaced. */
  decidedAt: string | null
  /** The reason a denial gave. */
  reason: string | null
  /** An approval is for the run it starts only. */
  allowedFor: 'this_run'
}

/** The facts of a conversation's record the header shows. */
export type ConversationFacts = {
  replies: number
  failed: number
  /** The latest reply, while it is a failure: what Try again sends again. */
  latestFailure: LatestFailure | null
  /** The agent's memory as the runtime reported it after the last run; null until one has. */
  contextUse: ContextUse | null
}

/** A `SYSTEM` row's own fields, by its `kind`: a failed run's, a stopped run's, or a summary's. */
export type TranscriptEntryDetail = RunFailedDetail | RunStoppedDetail | ContextSummarisedDetail

/** An `APPROVAL_REQUESTED` row's request and its answer. `request`: `{ tools: [{ name, reason? }], bashPatterns: [{ pattern, reason? }] }`. */
export type TaskSessionApproval = {
  status: NonNullable<RunRow['manifestStatus']>
  request: JsonValue
  decidedById: string | null
  decidedAt: string | null
  reason: string | null
}

/** One row of a task session's record. */
export type TaskSessionEntry = {
  id: string
  sessionId: string
  role: TranscriptRow['role']
  /** Who sent a person's message (their id); null on every other row. */
  authorId: string | null
  /** Who sent it by name; null for the viewer's own and on every other row. */
  authorName: string | null
  content: string
  thought: string | null
  thinkingDurationMs: number | null
  toolName: string | null
  toolInput: JsonValue
  toolOutput: JsonValue
  model: string | null
  usage: TokenUsage | null
  toolUseId: string | null
  runId: string | null
  kind: TranscriptEntryKind | null
  detail: TranscriptEntryDetail | null
  runStatus: RunRow['status'] | null
  approval: TaskSessionApproval | null
  createdAt: string
  /** On an approval request: the request and its answer in plain words. */
  approvalCard?: ApprovalCard | null
  /** On a summary marker: who asked for it, by name, and whether it was the viewer. */
  summarisedBy?: string | null
  summarisedByYou?: boolean
}

/** One of the session's runs, oldest first, with what started it in words ("started by automation · for Avery"). */
export type TaskSessionRun = {
  id: string
  status: RunRow['status']
  createdAt: string
  endedAt: string | null
  usage: TokenUsage | null
  startedBy: string | null
}

/** A task's session: null when the task has none, or the reader may not see the task. */
export type TaskSessionView = {
  id: string
  agentId: string
  userId: string
  title: string | null
  status: SessionStatusValue
  sessionType: string
  model: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  createdAt: Date
  updatedAt: Date
  taskId: string | null
  primaryOwnerType: WorkspaceOwnerType | null
  primaryOwnerId: string | null
  primaryWorkspaceId: string | null
  closedReason: SessionClosedReasonValue | null
  runtime: string | null
  conversationId: string | null
  workerGeneration: number
  entries: TaskSessionEntry[]
  conversation: ConversationFacts
  AgentRun: TaskSessionRun[]
}
