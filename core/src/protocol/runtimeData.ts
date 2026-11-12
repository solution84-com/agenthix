/**
 * Runtime data contract — plan 5d-2.
 * hq → site requests (channel.request) for dispatch, run/session lifecycle and
 * runtime reads; site → hq one-way events (site.event) for status and stream.
 * Every Date crosses as an ISO string, matching siteData.ts.
 *
 * Every exported object type below is a `type` alias, not an `interface` —
 * same reason as `connection.ts`'s `SiteDescribeResult`: Wasp operations
 * return superjson `Payload`, which needs the implicit index signature an
 * interface doesn't have, so an interface fails the SDK build while source
 * `tsc --noEmit` stays green. `siteData.ts` obeys the same rule for all nine
 * of its types.
 */

import type { WorkspaceOwnerType } from './siteData.js'
import type { RunLimits } from './runLimits.js'
import type { SessionStatusValue, SessionClosedReasonValue } from './sessionState.js'
import { ACTIVE_RUNS_METHOD } from './activeRuns.js'
import { RUN_USAGE_METHOD } from './runUsage.js'
import type { JsonValue } from '../client/json.js'
import type { ContextUse } from './contextUse.js'
import type { RunContextPayload } from './runContext.js'

/**
 * Result shapes for the read, dispatch, and delete methods below, so hq and
 * site can't invent divergent ones; the remaining mutations (cancel/reject,
 * session create/rename/archive/deleteMany/clearRuns, agent.stop)
 * return void-like acks defined by their own handlers, not documented here:
 *   run.dispatch    → RunDispatchResult
 *   run.get         → RunRow | null
 *   run.list        → RunRow[], always ordered createdAt descending — `limit: 1` means newest
 *   run.listPage    → RunListPageResult — the same rows, paged, keyed on
 *                     `runFeedKey` (startedAt, or createdAt when it never
 *                     started) with `id` as the tiebreak. Its own name
 *                     rather than an option on `run.list`, which is unchanged
 *                     and every routed caller still uses.
 *   run.count       → { count: number }
 *   run.stats       → RunStatsResult — org-wide aggregate over EVERY run
 *                     (not a page), computed on site so the totals never
 *                     regress to "however many rows the last list call
 *                     fetched" the way summing over `run.list({limit})`
 *                     did before this method existed (finding 3, review
 *                     of plan 5d-2 task 9b's read cutover)
 *   transcript.list → TranscriptRow[], oldest→newest by default; `tail: true`
 *                     selects the NEWEST `limit` rows instead (still returned
 *                     oldest→newest) — the chat-UI-correct way to degrade a
 *                     transcript longer than the transport's cap (finding 1)
 *   toolcall.list   → ToolCallRow[]
 *   session.get     → SessionRow | null
 *   session.delete  → { deleted: boolean } — false on a missing id, never a throw
 *   agent.promptPreview → AgentPromptPreviewResult
 *   run.approve     → { approved: boolean } — false when the run is missing or not
 *                     PENDING_APPROVAL, never a throw (same non-throwing shape as
 *                     the delete family above)
 *   agent.removeDirectory → { removed: boolean } — false when the agent never ran
 *                     on this site and has no directory there. Its params are
 *                     `{ handle }` and nothing else: the site derives the path
 *                     from its own root, so hq cannot name one.
 *
 * An approval is for the next run only. A run never waits for one: what needs
 * it is refused and listed, and the run ends with the list (`PENDING_APPROVAL`).
 *
 * `run.approve`'s params are `{ runId }`. It marks a task's or a conversation's
 * request APPROVED on site, leaving `pendingManifest` in place, and hq then
 * starts the next run there. That run alone is given what was approved: the site
 * carries a request forward only from the newest earlier run of the session, so
 * the run after it gets nothing. `{ approved: false }` when the run is missing,
 * not pending, or no longer the newest run of its session.
 *
 * `run.reject`'s params are `{ runId, reason?, replaced? }`. `replaced: true`
 * marks an unanswered request `SUPERSEDED` — something newer in its task or
 * conversation replaced it — and changes nothing else; it is idempotent. A site
 * also replaces every unanswered request of a session itself when it starts a
 * newer run there.
 */
export const RUNTIME_METHODS = {
  runDispatch: 'run.dispatch',
  runCancel: 'run.cancel',
  runReject: 'run.reject',
  runApprove: 'run.approve',
  runGet: 'run.get',
  runList: 'run.list',
  runListPage: 'run.listPage',
  runCount: 'run.count',
  runStats: 'run.stats',
  transcriptList: 'transcript.list',
  toolCallList: 'toolcall.list',
  sessionCreate: 'session.create',
  sessionGet: 'session.get',
  sessionRename: 'session.rename',
  sessionArchive: 'session.archive',
  sessionDelete: 'session.delete',
  sessionDeleteMany: 'session.deleteMany',
  sessionClearRuns: 'session.clearRuns',
  agentStop: 'agent.stop',
  agentRemoveDirectory: 'agent.removeDirectory',
  agentPromptPreview: 'agent.promptPreview',
  // The active-runs read (person-scoped execution spec §3) — named from
  // activeRuns.ts's own constant so the two never drift, per that module's
  // header comment. Joins RUNTIME_METHODS only now that a site serves it
  // (contract report assumption 6).
  runListActive: ACTIVE_RUNS_METHOD,
  runUsage: RUN_USAGE_METHOD,
} as const

/** One prompt section as the preview shows it — mirrors each app's own `PromptSection`. */
export type PromptPreviewSection = { key: string; label: string; content: string; editable: boolean }

/** `agent.promptPreview`'s answer. */
export type AgentPromptPreviewResult = { prompt: string; sections: PromptPreviewSection[] }

export type RuntimeMethod = (typeof RUNTIME_METHODS)[keyof typeof RUNTIME_METHODS]

/** Single source for the session-type vocabulary — runtimeChannelMethods.ts's
 *  zod validator feeds from this array, so widening it here widens the
 *  validator too, without a second edit. */
export const SESSION_TYPES = ['chat', 'task'] as const

/** Session creation-time fields — written by hq, upserted verbatim by site (D3). */
export type SessionSeed = {
  id: string
  sessionKey: string
  agentId: string
  userId: string
  sessionType: (typeof SESSION_TYPES)[number]
  taskId: string | null
  title: string | null
  model: string | null
  /** hq's own notes on the session, arbitrary JSON by design; the site stores them as they come. */
  metadata: Record<string, JsonValue>
  primaryOwnerType: WorkspaceOwnerType | null
  primaryOwnerId: string | null
  primaryWorkspaceId: string | null
  /** The runtime the session was created with (the agent's `runtime` then); a
   *  conversation never moves between runtimes. Null until it is recorded. */
  runtime: string | null
  createdAt: string
}

/** Row type served by `session.get` — site's AgentSession scalars exactly, dates as ISO strings. */
export type SessionRow = {
  id: string
  sessionKey: string
  agentId: string
  userId: string
  title: string | null
  status: SessionStatusValue
  /** Set only when `status` is CLOSED. */
  closedReason: SessionClosedReasonValue | null
  runtime: string | null
  sessionType: string
  model: string | null
  /** The seed's `metadata`, as stored: arbitrary JSON by design. */
  metadata: JsonValue
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  taskId: string | null
  primaryOwnerType: WorkspaceOwnerType | null
  primaryOwnerId: string | null
  primaryWorkspaceId: string | null
  /** The runtime's memory of the conversation as its last run left it; null before any run reported it. */
  contextUse: ContextUse | null
}


/**
 * What started a run: a person, a task's start time, or an agent with its tool
 * (adr-0091, adr-0175). A run an agent starts is never a person's, whatever run
 * started it: it carries the turn limit and cannot start another.
 *
 * 'pulse' is deprecated: the pulse is gone (adr-0175) and hq no longer sends it;
 * a site still reads it as a run no person started.
 */
export type RunStartedBy = 'person' | 'pulse' | 'schedule' | 'agent'

export const RUN_STARTED_BY: readonly RunStartedBy[] = ['person', 'pulse', 'schedule', 'agent']

/**
 * Reads what started a run off an untrusted value (a verified token's payload,
 * a stored column), or null when it is absent or not one of the four. Callers
 * treat null as "not a person" — an automated run must never be read as one a
 * person started.
 */
export function parseRunStartedBy(value: unknown): RunStartedBy | null {
  return typeof value === 'string' && (RUN_STARTED_BY as readonly string[]).includes(value)
    ? (value as RunStartedBy)
    : null
}

export type RunDispatchPayload = {
  kind: 'chat' | 'task'
  startedBy: RunStartedBy
  capabilityJwt: string
  session: SessionSeed
  inputText: string
  /**
   * The skill the person picked for this message (`/` in the message box): a name staged for this turn. The site
   * keeps it only when it is one, and the skill may be invoked by a person; otherwise it drops it and keeps the text.
   * ABSENT when none was picked, and from an hq before 1.9.
   */
  skill?: { name: string }
  model: string
  hideUserMessage: boolean
  context: RunContextPayload
  /**
   * The limits this run is stopped by (`runLimits.ts`): `timeLimitMinutes` for
   * every run, `turnLimit` only when `startedBy` is not `'person'`.
   */
  runLimits: RunLimits
  /** Who the run is on behalf of — its starter, else the task's person — and so its message's author
   *  (`sharedSessions.ts`). The site records it on both. Absent when no person is behind the run. */
  onBehalfOfUserId?: string
  /**
   * The routine whose firing this run is (adr-0177): a `chat` run with no task, which the site records on the run.
   * ABSENT for every other run, and from an hq before 1.15.
   */
  routineId?: string
}

export type RunDispatchResult = {
  runId: string
  sessionId: string
}

/**
 * `run.cancel`'s params. `reason` is optional and additive — no protocol bump
 * needed (13.0 stands). Omitted, the site's existing behaviour is unchanged:
 * it records the run's error as "Cancelled by user" (someone pressed Stop).
 * `'interrupted'` is hq's own interrupt-if-busy path (person-scoped execution
 * spec §2, `busyConversationInterrupt.ts`) stopping a turn to send a new
 * message into the same conversation; the site records "Interrupted by a new
 * message" instead, so the two read differently in the run's history. Any
 * other value is refused by the site's zod schema.
 *
 * `'withdrawn'` is a person
 * cancelling a message still waiting behind a running reply: a run that has
 * not started is cancelled and its message taken out of the transcript; one
 * that has started is stopped as by Stop.
 *
 * `'paused'` (`runPause.ts`) is a scheduled
 * change about to happen: the step going finishes, the next tool call is
 * refused, and the run ends as cancelled with `runPausedReason(by)`, its
 * conversation kept for the run that carries on afterwards. A run not started
 * yet is cancelled at once, the same way.
 */
export type RunCancelReason = 'interrupted' | 'withdrawn' | 'paused'
/** `by` names the person who stopped or interrupted the run, for its error and transcript
 *  ("Stopped by Ana"); absent when nobody did. */
export type RunCancelParams = { runId: string; reason?: RunCancelReason; by?: string }

export type { AgentConfigPayload, RunContextPayload, PinnedMemoryItem, RunMemory, RunMemoryItem } from './runContext.js'
export type { TokenUsage, RunRow } from './runRow.js'
