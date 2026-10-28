// ── Tool permission types ─────────────────────────────────────────────────────

/**
 * Three-state permission model for tools and bash patterns.
 *
 * always — executes immediately, no HITL gate.
 * ask    — visible to Claude; calling it triggers HITL manifest approval.
 * never  — invisible to Claude; removed from SDK context via disallowedTools.
 */
import type { RelayCredential, SiteRunCredential } from '../../server/modelRelay/runAccess'
import type { ApprovedManifest, AuditSummary, PendingManifest, ToolPermissionState, ToolPermission, BashPatternPermission, RunContextPayload, SessionClosedReasonValue, RunLimits, RunStartedBy, TaskCommentForRun, ContextUse } from '@agenthix/core'
import type { ResolvedRunPackages } from '../../packages/runPackages'
import type { BoundaryOverride } from '../../packages/boundaryOverrides'
import type { RunSkillInputs } from './skillSources'
export type { ToolPermissionState, ToolPermission, BashPatternPermission }

/**
 * The runtime whose process authenticates from Claude Code's own OAuth
 * document — the one thing that makes a `.credentials.json` in the run's
 * Claude home relevant at all. The OpenCode runtime reaches its providers
 * with an API key and has no use for one.
 *
 * A single exported literal rather than three comparisons against a string:
 * `runLaunch` selects the runtime by it and refuses an SDK run with no
 * credential by it, and `checkAgentCredentials` decides whether to probe for
 * OAuth files by it. Three spellings of one value is how one of them quietly
 * stops matching.
 */
export const CLAUDE_SDK_RUNTIME = 'claude-sdk'

/** The runtime behind every model that is not Claude on a subscription (adr-0073). */
export const OPENCODE_RUNTIME = 'opencode'

// ── HITL manifest types ───────────────────────────────────────────────────────

/**
 * Tool/bash requests collected during a deferred-mode run.
 * Populated in-flight by PreToolUse; checked after the run completes. Stored as the run's
 * `pendingManifest` (core's `PendingManifest`).
 */
export type DeferredManifest = PendingManifest

export interface ManifestRequest {
  /** Filled from DB-sourced values at merge time; agent output may omit these. */
  baseTools?: string[]
  baseBashPatterns?: string[]
  taskSummary?: string
  extendedTools: { name: string; reason: string }[]
  extendedBashPatterns: { pattern: string; reason: string }[]
}

export type { ApprovedManifest, AuditSummary }

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context passed to every runtime when executing a run.
 */
export type RunContext = {
  runId: string
  sessionId: string        // AgentSession.id — used as SDK session ID for all session types
  taskId: string | null    // null = conversational run, set = task run (ephemeral)
  projectId: string | null // null = chat run (no project context); set = task run
  model: string            // resolved active model: AgentSession.model ?? Agent.defaultModel
  prompt: string           // the user message or task description
  /** The turn asks the runtime to summarise its memory of the conversation (Summarise now), and says nothing else. */
  summarise?: boolean
  agent: {
    id: string
    handle: string
    name: string
    systemPrompt: string | null  // pre-built by caller via buildAgentPrompt
    // No directory of the agent's own, and no path of the agent's own either:
    // a run works in its storage boundary (`cwd` below, and `workingTreeDir`
    // for the server's own view of it), and the Claude home it stages skills
    // into belongs to that boundary too (`claudeHome` below).
    defaultModel: string
  }
  isNewSession?: boolean   // true = no prior SDK session exists, use sessionId; false = resume existing
  abortSignal?: AbortSignal
  mcpServers?: Record<string, { type: 'http'; url: string; headers?: Record<string, string> }>
  bypassed?: boolean                 // true = the run's approval is bypassed (from the capability); skips PreToolUse gates
  immediateApproval?: boolean        // true = the run's approval is immediate; stops the run at the first blocked call
  allowedTools?: ToolPermission[]    // Per-tool states (always/ask/never) from agent config; undefined = approval bypassed
  allowedBashPatterns?: BashPatternPermission[]  // Per-pattern states from agent config
  neverTools?: string[]              // Canonical names of 'never'-state tools — always populated for disallowedTools SDK option
  approvedManifest?: ApprovedManifest  // Present for task/chat runs after manifest approval
  deferredManifest?: DeferredManifest  // Mutable; PreToolUse pushes deferred tool requests here during execution
  containerName?: string               // Set when AGENT_CONTAINER_ISOLATION is active; read by ClaudeSDKRuntime
  gitCredEnv?: Record<string, string>  // Env for the agent's container: the run token (SITE_MCP_KEY) and its handle
  cwd: string                          // Run working directory — the session's primary location (ADR-0039)
  capability?: import('./capabilityRenewal').CapabilityHolder  // §2a: minted at run start (by hq), renewed in place during long runs
  /** The run's own provider, from hq's descriptor (RunContextPayload.modelAccess,
   *  runAccess.ts): an API key or Agenthix Cloud, which the model relay adds to
   *  each request, or the subscription login of the person the run acts as. */
  credential: SiteRunCredential | null
  /** The turn's other providers (`modelAccess.others`), relayed only. The model
   *  relay serves a request with `credential` or one of these, by relay path (spec §6). */
  fallbackCredentials?: RelayCredential[]
  /** The billing profile every model call of the run is costed to; absent from an hq that sends none. */
  billingProfileId?: string
  /** The org's web-search (Exa) key for this turn (RunContextPayload.webSearchKey),
   *  absent when the org has none. Held here for the `web_search` platform tool
   *  and never put in a container's environment. */
  webSearchKey?: string
  /** SiteConfig.riskRules (RunContextPayload.riskRules), pre-resolved by hq at dispatch —
   *  read by sdkToolGate's audit-log risk rating. */
  riskRules: RunContextPayload['riskRules']
  /** The cached package content this run loads, by digest (ADR-0072). */
  packages: ResolvedRunPackages
  /** The boundary's override directory + files home for this agent, or null
   *  (none, unsafe). Both are already real-path-resolved once, at
   *  launch — every actual read under it (promptContent.ts, skillStaging.ts)
   *  rechecks containment again at the moment it happens (P18's TOCTOU note). */
  boundaryOverride: BoundaryOverride | null
  /** The skills hq named for this run beside its packages (installed, in the
   *  place's files, the person's), or null when the dispatch named none
   *  (skillStaging.ts stages only what is named here, and the platform's). */
  skills: RunSkillInputs | null
  /** The Claude home this run's container has — keyed by the storage boundary
   *  the container is named for, never by the agent (spec §6.1, §6.3). Both
   *  views of one directory: `serverDir` is where this process stages the
   *  run's skills and writes its credential, `visibleDir` is what the run
   *  itself is told, which under container isolation is the fixed container
   *  path and reveals nothing of the site's layout. Resolved once at launch so
   *  the runtime never re-derives a path the container manager already bound. */
  claudeHome: { serverDir: string; visibleDir: string }
  /** The run's working tree on this machine — the directory its primary
   *  location resolves to, as the SITE SERVER PROCESS sees it (never the
   *  container-side path `cwd` carries under isolation).
   *
   *  Unrelated to `boundaryOverride` above it, which is a package directory
   *  for a boundary's overrides of an agent — the two share no lineage beyond
   *  both being resolved per run. */
  workingTreeDir: string
}

/**
 * Events emitted by runtimes. AgentEngine consumes these above the interface.
 * ClaudeSDKRuntime emits: text_delta, tool_call, tool_result, thinking, status
 */
export type RunEvent =
  | { type: 'text_delta';   textDelta: string }
  | { type: 'tool_call';    toolUseId: string; toolName: string; toolInput: unknown }
  | { type: 'tool_result';  toolUseId: string; output: string }
  | { type: 'thinking';     thinking: string }
  /** Something the person should know while the turn waits, such as the provider being retried (providerRetry.ts). */
  | { type: 'notice';       notice: string }
  /** One round trip with the model has come back. Counted against a run's turn limit (runLimitWatch.ts). */
  | { type: 'model_round_trip' }
  /** The runtime summarised its own copy of the conversation (automatically, or asked to), with the summary when it gave one. */
  | { type: 'compacted';   trigger: 'auto' | 'manual'; summary: string | null; tokensBefore: number | null }
  /** The runtime's memory of the conversation, read as the turn ended. */
  | { type: 'context_use'; use: ContextUse }
  | { type: 'status';      status: 'running' | 'completed' | 'failed' | 'cancelled'; error?: string; model?: string; sdkSessionId?: string; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; totalTokens: number } }

/**
 * What a runtime is asked when it must say whether a conversation's harness
 * state still exists (person-scoped execution spec §4). Inputs rather than a
 * RunContext, so the question can be put before a run is launched, and so how
 * the home and working directory are worked out stays the launch's business.
 */
export interface SessionExistenceQuery {
  /** Our AgentSession id — the harness session is started and resumed under it. */
  sessionId: string
  /** The runner's harness home as this server process sees it. */
  harnessHomeDir: string
  /** The run's working directory as the harness sees it (the container path
   *  under isolation). A harness files a conversation under it. */
  workingDirectory: string
  /** The container the run will use, when it has one: a harness whose state is
   *  asked of a running process there (OpenCode's server) needs it. */
  containerName?: string | null
}

/**
 * A conversation, named to its runtime outside any turn (spec §1, §3): when it
 * has gone idle, or has ended.
 */
export interface ConversationRef {
  /** Our AgentSession id — also the value of its processes' tag (core's CONVERSATION_PROCESS_TAG). */
  sessionId: string
  /** The container its turns run in, or null when its harness runs on this machine. */
  containerName: string | null
}

/**
 * The interface both runtimes implement.
 *
 * A turn is `run`. The conversation-level calls exist because a harness can
 * stay warm across a conversation's turns (adr-0081): the site tells the
 * runtime when the conversation no longer needs it. Neither kills the
 * conversation's own processes — the site does that by their tag
 * (conversationProcesses.ts) — and neither may throw for a conversation the
 * runtime holds nothing for.
 */
export interface AgentRuntime {
  run(context: RunContext): AsyncIterable<RunEvent>
  /** Whether the harness still holds this session's state, so it can resume
   *  it. Asked of the harness state itself, never inferred from error text. */
  sessionExists(query: SessionExistenceQuery): Promise<boolean>
  /** The conversation's idle time has passed with no turn running (spec §3):
   *  let go of what the harness keeps warm for it. Its state stays, so its
   *  next turn resumes. */
  conversationIdle(conversation: ConversationRef): Promise<void>
  /** The conversation has ended — closed, deleted, or its person gone: let go
   *  of everything the harness holds for it, and it will not be resumed. */
  endConversation(conversation: ConversationRef): Promise<void>
}

// ── Run entry-point options ───────────────────────────────────────────────────
// Moved here from AgentEngine.ts during the site severance so RunOptions sits beside
// the other driver-context types this module owns — the dispatch modules read it
// from here rather than reaching into AgentEngine.ts.

export interface ChatContext {
  sessionContext?: string | null
}

export interface TaskContext {
  projectId: string
  boardName: string
  columns: string
  taskId: string
  title: string
  description: string
  /** Resolved by the site (`runRoadmap.ts`), never sent by hq: the path the run itself sees. */
  roadmapPath: string
  /** The comments written since this agent's last run on the task (`taskComments.ts`). */
  newComments?: TaskCommentForRun[]
}

export interface RunOptions {
  /**
   * Chat path. Every run is queued on its session (AgentEngine.run,
   * runQueueKey.ts) — what this still selects is the pair of
   * guards that only the chat path wants: the in-flight dedup on a retriggered
   * message, and the PENDING gate before the run is queued at all. A task
   * run leaves it unset, because its caller owns the lifecycle.
   */
  queued?: boolean
  chatContext?: ChatContext       // chat run context; engine builds prompt from this + container mounts
  taskContext?: TaskContext       // task run context; engine builds prompt from this + container mounts
  mcpServers?: Record<string, { type: 'http'; url: string; headers?: Record<string, string> }>
  deferredManifest?: DeferredManifest  // mutable collector; PreToolUse pushes deferred tools here
  /**
   * hq's pre-resolved dispatch context (core's RunContextPayload) — the severance
   * target for plan 5d-2 (spec, core/src/protocol/runtimeData.ts): every hq-only
   * Prisma read the runtime used to do directly is pre-resolved here at dispatch
   * time. Required — every run on site is dispatched by hq, there is no run that
   * doesn't carry one. Threaded in by Task 8's dispatch handler.
   */
  dispatchContext: RunContextPayload
  /**
   * The run's capability JWT, pre-minted by hq (RunDispatchPayload.capabilityJwt,
   * core/src/protocol/runtimeData.ts) and verified locally via site's own
   * verifyHqToken (server/identity/verifyHqToken.ts, ADR-0044) — site never mints
   * capabilities itself, only verifies and later renews them over HTTPS
   * (HQ_CAPABILITY_RENEW_PATH). Threaded in by Task 8's dispatch handler.
   */
  capabilityJwt: string
  /** A title the site just generated for this session (chatExecution.ts) — sent to
   *  hq on the RUNNING frame's sessionPatch so hq's copy matches site's row. */
  sessionTitle?: string | null
  /** The limits hq set for this run, which the engine watches (runLimitWatch.ts). */
  runLimits: RunLimits
  /** What started the run; absent counts as a person, so no turn limit applies. */
  startedBy?: RunStartedBy
  /** A Summarise now run (`SUMMARISE_NOW_INPUT`): the runtime summarises its memory, and no reply is expected. */
  summarise?: boolean
}

/**
 * What `AgentEngine.run(...)` actually resolves with: `processRun` returns
 * the status it genuinely wrote to the run row —
 * `COMPLETED` from the success path, `FAILED`/`CANCELLED` from the catch
 * (which does NOT rethrow, so `run()` always resolves, never rejects, on a
 * failed run too). `undefined` covers the dedup/skip paths (an already
 * in-flight run, or a run no longer PENDING by the time it was picked up) —
 * nothing was written in those cases, so there is no real status to report.
 * Callers that feed this into `reportDeferredManifestIfAny` must treat
 * `undefined` as "no terminal status to relay"; in practice that branch is
 * unreachable there anyway, since a skipped run's `deferredManifest` is
 * always empty (PreToolUse never ran).
 *
 * `withheldFrame` (spec review, BLOCKER 1 — one terminal frame per run):
 * present only when `processRun` found `options.deferredManifest` non-empty
 * at terminal time. AgentEngine still writes its own session row and run row
 * exactly as it always does — only the `siteStream.status(...)` FRAME is
 * withheld, because `deferredManifestReport.ts` is the run's single terminal
 * sender in that case and needs what the engine would have sent (the token
 * totals) to relay
 * verbatim on its own frame. Two frames (the engine's own, unconditionally,
 * plus the report's) made hq's terminal-frame latch finalize the task off
 * the FIRST one before the second — carrying the manifestPending that
 * actually mattered — ever arrived, silently dropping HITL approval.
 */
export interface RunOutcome {
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED'
  withheldFrame?: {
    sessionPatch: {
      title?: string
      status?: 'CLOSED'
      closedReason?: SessionClosedReasonValue
      totalInputTokens?: number
      totalOutputTokens?: number
      totalCacheReadTokens?: number
      totalCacheWriteTokens?: number
    } | null
    /** Why the run failed or was stopped (a time or turn limit, say), relayed beside the request. */
    error?: string | null
  }
}
