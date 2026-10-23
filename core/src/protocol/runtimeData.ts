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
import type { RunPackages } from './packages.js'
import type { ApiKeyRunCredential, RunCredential } from './credential.js'
import type { RunModelAccess } from './runProvider.js'
import type { RunLimits } from './runLimits.js'
import type { SessionStatusValue, SessionClosedReasonValue } from './sessionState.js'
import { ACTIVE_RUNS_METHOD } from './activeRuns.js'
import { RUN_USAGE_METHOD } from './runUsage.js'
import type { TaskCommentForRun } from './sharedSessions.js'
import type { Approval, BashPatternPermission, ToolPermission } from './capability.js'
import type { ApprovedManifest, AuditSummary, PendingManifest, RiskRule } from './runManifest.js'
import type { JsonValue } from '../client/json.js'
import type { ContextUse } from './contextUse.js'

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

/** The agent's config row, pre-resolved by hq at dispatch. */
export type AgentConfigPayload = {
  id: string
  name: string
  handle: string
  role: string | null
  runtime: string
  /** The run's effective approval: the strictest of the agent's own and its boundary's narrowing. */
  approval: Approval
  defaultModel: string
  /**
   * The run's effective tools and bash patterns — the agent's own with its boundary's narrowing applied, the same
   * resolution the capability is minted from. Each state per entry; a list of bare names gives each `always`; null
   * is the runtime's defaults (tools) or none (patterns). Read from a stored JSON column, so the site still reads it
   * through its own coercion (`coerceToolPermissions`), never trusting the form.
   */
  allowedTools: ToolPermission[] | string[] | null
  allowedBashPatterns: BashPatternPermission[] | string[] | null
  isKernel: boolean
}

export type RunContextPayload = {
  agent: AgentConfigPayload
  /** Chat-only. Carried no `userHandle` since the agenda stopped being keyed by
   *  one: the agenda is the person's within a location, and the member folder
   *  holding it is keyed by the immutable user id like every other storage path
   *  (close-out spec §6.1). Nothing else ever read the handle. */
  chat?: { sessionContext: string | null }
  /** Task-only. All strings pre-rendered by hq; `columns` is the board's columns, formatted. */
  task?: {
    taskId: string
    taskKey: string // e.g. "WEB-42" — number + project key
    title: string
    description: string
    projectId: string
    projectName: string
    projectSlug: string
    boardName: string
    columns: string
    /** The newest comments not by this agent, oldest first (`sharedSessions.ts`); the site keeps those since its last run. */
    comments?: TaskCommentForRun[]
  }
  /**
   * Mount inputs, pre-resolved by hq. A run reaches one owner's storage — its
   * own — so this carries slugs, not a set of owners: the mount set follows
   * `primaryLoc`, and nothing here can widen it.
   */
  mounts: {
    /** locationResolver's slug lookups, pre-resolved by owner id. */
    ownerSlugs: Record<string, string>
  }
  /** SiteConfig.riskRules (sdkToolGate), null when unset. */
  riskRules: RiskRule[] | null
  /**
   * The one model credential this run may use, decided by the boundary it acts
   * for (spec §6.3, ADR-0060) — an API key, or the subscription login of the
   * person the run acts as. Null when the boundary has none configured and
   * neither does the org, which the site turns into a failed run naming the
   * boundary rather than falling through to whatever the container holds.
   *
   * REQUIRED, and it replaced `llmApiKey` — a removal, which is why the
   * protocol major moved (see connection.ts).
   *
   * @deprecated since 1.1; stops working in 3.0. Use `modelAccess` instead.
   */
  credential: RunCredential | null
  /**
   * The API keys for the turn's other providers — one per provider of a
   * fallback model the turn may switch to, resolved by the same rules as
   * `credential` (spec §6, "Every provider the turn may use has its
   * credential"). Never `credential`'s own provider again, never a
   * subscription. The site's model relay picks a request's key from
   * `credential` and these by provider. ABSENT when there are none.
   *
   * @deprecated since 1.1; stops working in 3.0. Use `modelAccess` instead.
   */
  fallbackCredentials?: ApiKeyRunCredential[]
  /**
   * The run's model via its provider, the provider descriptor the site's relay adds the key from, any other provider
   * a helper of the run may use, and the billing profile its calls are costed to (runProvider.ts). Decided by hq's
   * resolver. ABSENT from an hq before 1.1, which sends `credential`; a site reads this first when both are there.
   */
  modelAccess?: RunModelAccess
  /**
   * The org's web-search key (Exa), for this turn only. ABSENT when the org has
   * none. The site holds it on the run's context for the `web_search` platform
   * tool and never puts it in a container's environment.
   */
  webSearchKey?: string
  /** Why `credential` is null, when hq knows — the site shows it verbatim as the run's error. */
  credentialProblem?: string
  /**
   * The content this run loads, each package named by its digest (ADR-0072). hq
   * has delivered every one the site lacked before sending the dispatch; the
   * site fails the run rather than load any other content (`package_unavailable`).
   */
  packages: RunPackages
  /**
   * The person this run is on behalf of, so the agent can read "tomorrow at 9"
   * on their clock: their IANA timezone. The site adds the current local time
   * from its own clock when it builds the prompt. ABSENT when the run has no
   * person or the person has set none. The agent's scheduling tools read the
   * person's timezone on hq's side either way.
   */
  person?: { timezone: string }
  /**
   * The pinned memory this run may read (memory and knowledge spec, Workers and helpers): the pinned items of
   * the person the run is for, in their two scopes for this agent, and of the agent in the run's place. hq
   * resolves them under the one rule; the site writes them as a read-only file in the run's home at every run
   * start. ABSENT when there are none; the run still reaches memory through `recall`.
   */
  pinnedMemory?: PinnedMemoryItem[]
}

export type PinnedMemoryItem = {
  key: string
  /** `person`, `agent_person` or `agent_place`, as the memory tools name the scopes. */
  scope: 'person' | 'agent_person' | 'agent_place'
  title: string
  body: string
}

/**
 * What started a run: a person, a boundary's pulse, a task's schedule, or an
 * agent with the `run_task` tool (adr-0091). A run an agent starts is never a
 * person's, whatever run started it: it carries the turn limit and cannot
 * start another.
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

/**
 * Copied from hq/src/shared/utils/aiMetrics.ts's `TokenUsage` — moved into
 * core so the wire shape isn't duplicated; aiMetrics.ts now re-exports this
 * one instead of declaring its own.
 */
export type TokenUsage = {
  /** Fresh (non-cached) input tokens. */
  inputTokens: number
  outputTokens: number
  /** Tokens read from prompt cache. Omit or set 0 if provider does not cache. */
  cacheReadTokens?: number
  /** Tokens written to prompt cache. Omit or set 0 if provider does not cache. */
  cacheWriteTokens?: number
  /** Total processed tokens = input + cacheRead + cacheWrite + output. Used for env estimates. */
  totalTokens: number
}

/** Row types served by run.get / run.list / transcript.list / toolcall.list. */
export type RunRow = {
  id: string
  agentId: string
  sessionId: string
  taskId: string | null
  parentRunId: string | null
  rootRunId: string | null
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  inputText: string
  outputText: string | null
  thought: string | null
  model: string
  error: string | null
  usage: TokenUsage | null
  /** The history of the run's model attempts and errors, as stored: arbitrary JSON by design (nothing writes it now; it defaults to `[]`). */
  diagnosticLog: JsonValue
  /** `SUPERSEDED`: the request was replaced by something newer in its task or conversation. */
  manifestStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | null
  /** What a deferred run asks to be approved for; null when it asked for nothing. */
  pendingManifest: PendingManifest | null
  /** What the run was approved for; null when it ran on its own permissions. */
  approvedManifest: ApprovedManifest | null
  /** hq's id of the person who approved or denied the request; null when undecided or when no person is known. */
  manifestDecidedById: string | null
  /** When the request was approved, denied, or replaced by something newer; null while undecided. */
  manifestDecidedAt: string | null
  /** The runtime's memory of the conversation as this run left it (`contextUse.ts`); null when it reported none. */
  contextUse: ContextUse | null
  /** Written when the run ends; null before then. */
  auditSummary: AuditSummary | null
  /** The run's own notes (what started it, for whom), arbitrary JSON by design. */
  metadata: JsonValue
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  /** The digest of each package's content the run loaded (ADR-0072); org is null before an org exists. */
  agentPackageDigest: string | null
  orgPackageDigest: string | null
  platformPackageDigest: string | null
}
