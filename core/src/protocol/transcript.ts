/**
 * A conversation's record as the site keeps it: `transcript.list`'s rows and
 * `toolcall.list`'s.
 *
 * Split out of `runtimeData.ts` when that file passed the repository's
 * file-size limit; the method names stay in its `RUNTIME_METHODS`. Type
 * aliases rather than interfaces, for the reason that file gives.
 *
 * The record is the whole conversation (every screen reviewed, *What a conversation shows*): each row
 * names the run that wrote it, and what used to exist only on screen or on
 * the run is a row of its own, a `kind`, where it happened — a thought, a
 * failed or stopped run, an approval asked, the runtime summarising its
 * memory. Those rows are `SYSTEM` rows; a row with no `kind` is an ordinary
 * message or tool line.
 */
import type { RunRow, TokenUsage } from './runtimeData.js'
import type { RunResourceShortage } from './runResource.js'
import type { PendingManifest, ToolCallRiskLevel } from './runManifest.js'
import type { JsonValue } from '../client/json.js'

/** What a `SYSTEM` row records. */
export const TRANSCRIPT_ENTRY_KINDS = [
  /** A stretch of the agent's thinking, at the point it happened among the run's tool calls; `content` is the thought. */
  'THOUGHT',
  /** The run failed where its reply would be; `detail` is `RunFailedDetail`. The raw error stays on the run. */
  'RUN_FAILED',
  /** The run was stopped; `detail` is `RunStoppedDetail`. Any reply it had written is kept before it. */
  'RUN_STOPPED',
  /** The run ended asking for approval; the request and its answer are the run's, read as `TranscriptRow.approval`. */
  'APPROVAL_REQUESTED',
  /** The runtime summarised its own copy of the conversation; `detail` is `ContextSummarisedDetail`. */
  'CONTEXT_SUMMARISED',
] as const

export type TranscriptEntryKind = (typeof TRANSCRIPT_ENTRY_KINDS)[number]

export type RunFailedDetail = {
  /** A short sentence in plain words (`plainFailureReason`). */
  reason: string
  /**
   * A run that stopped for lack of memory, disk or processes: hq writes `reason` again from it with
   * the site's name (`runResourceSentence`). Absent otherwise.
   */
  resource?: RunResourceShortage
}

/**
 * Why a run was stopped: a person pressed Stop, a newer message interrupted it, a run limit, the harness itself,
 * or a scheduled change paused it at the end of a step (`'paused'`; `by` then names the change).
 */
export type RunStopCause = 'person' | 'new_message' | 'time_limit' | 'turn_limit' | 'harness' | 'paused'

export type RunStoppedDetail = {
  cause: RunStopCause
  /** The name hq gave of the person who stopped it, when it named one. */
  by: string | null
}

export type ContextSummarisedDetail = {
  /** `manual`: somebody asked (Summarise now); `auto`: the runtime did it on its own. */
  trigger: 'auto' | 'manual'
  /** What the agent remembers now, when the runtime said; null when it did not. */
  summary: string | null
  /** How much of its memory was in use just before, in tokens, when the runtime said. */
  tokensBefore: number | null
  /** hq's id of the person whose run summarised, for a manual one. */
  byId: string | null
}

/**
 * An `APPROVAL_REQUESTED` row's request and its answer, read off its run when
 * the row is listed — the answer is the request's state, never a message.
 * `decidedAt` is when it was approved, denied, or replaced by something newer.
 */
export type TranscriptApproval = {
  status: NonNullable<RunRow['manifestStatus']>
  /** The run's `pendingManifest`; null when the run recorded none. */
  request: PendingManifest | null
  decidedById: string | null
  decidedAt: string | null
  /** The reason a person gave for denying, when they gave one. */
  reason: string | null
}

export type TranscriptRow = {
  id: string
  sessionId: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'
  /** Who sent a USER message (a person's id); null for every other row, or when unrecorded. */
  authorId: string | null
  content: string
  thought: string | null
  thinkingDurationMs: number | null
  toolName: string | null
  /** On a TOOL line: the call's input and output as the harness gave them, arbitrary JSON by design. */
  toolInput: JsonValue
  toolOutput: JsonValue
  model: string | null
  /** On an ASSISTANT row: what its run used, as `RunRow.usage`; null on every other row. */
  usage: TokenUsage | null
  /** On a TOOL line: the harness's own id for the call, which pairs it with its `ToolCallRow`. Null on every other line and on a TOOL line written without one. */
  toolUseId: string | null
  /** The run that wrote the row — for a USER row, the run its message started. Null on a row no run wrote. */
  runId: string | null
  /** Set on a `SYSTEM` row: what it records; null on every other row. */
  kind: TranscriptEntryKind | null
  /** The `kind`'s own fields (see each kind); null when it has none. */
  detail: RunFailedDetail | RunStoppedDetail | ContextSummarisedDetail | null
  /** On a USER row: its run's status now — `PENDING` while the message waits behind a running reply. Null on every other row. */
  runStatus: RunRow['status'] | null
  /** On an `APPROVAL_REQUESTED` row: the request and its answer. Null on every other row. */
  approval: TranscriptApproval | null
  /** When it happened: for a tool line or a thought, when the call was made or the thinking began. */
  createdAt: string
}

export type ToolCallRow = {
  id: string
  runId: string
  toolName: string
  /** The call's input as the harness gave it, arbitrary JSON by design. */
  toolInput: JsonValue
  /** The harness's own id for the call (Claude's tool_use_id, OpenCode's callID); null when the gate was given none. */
  toolUseId: string | null
  riskLevel: ToolCallRiskLevel
  blocked: boolean
  blockReason: string | null
  createdAt: string
}

/**
 * `transcript.list`'s params. Default (no `tail`) keeps the transport's
 * long-standing behavior: the OLDEST `limit` entries, ascending. `tail: true`
 * (finding 1, review of plan 5d-2 task 9b) instead selects the NEWEST `limit`
 * entries — still returned ascending, so a caller's rendering code never has
 * to branch on which mode it asked for — which is the correct degradation for
 * a chat transcript longer than the cap: drop the oldest history, not the
 * messages the user just sent.
 */
export type TranscriptListParams = {
  sessionId: string
  limit?: number
  tail?: boolean
  /**
   * Only the TOOL lines with these harness call ids (at most `TRANSCRIPT_TOOL_USE_IDS_MAX`), so a call finds its own
   * output without reading the whole transcript.
   */
  toolUseIds?: string[]
}

/** The most call ids one `transcript.list` call may carry. */
export const TRANSCRIPT_TOOL_USE_IDS_MAX = 50
