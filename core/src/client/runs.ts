/**
 * The person's runs as a client reads them: the Runs panel's rows (`getMyRuns`), the Runs screen's pages
 * (`getRunsPage`), one run opened in full (`getRunDetail`), its calls (`getToolCallLog`) and what one of them printed
 * (`getToolCallOutput`), and a request for tools that waits for a person, with its answer.
 */
import type { SiteSilence } from '../protocol/combinedRead.js'
import type { TokenUsage } from '../protocol/runtimeData.js'
import type { JsonValue } from './json.js'
import type { ManifestPendingApprovalClientEvent } from './runEvents.js'

/** Waiting for a person (a tool request, a limit reached, blocked), going now, in a queue, or finished. */
export type MyRunGroup = 'waiting' | 'running' | 'queued' | 'finished'

export type RunStarter = {
  kind: 'person' | 'agent' | 'routine' | 'schedule' | 'automation' | 'unknown'
  /** The person's or agent's name, when the kind has one. */
  name: string | null
}

/** Why a queued task's run waits; the client turns it into words. */
export type RunWaitNote =
  | { kind: 'line'; position: number; agentName: string; agentBusy: boolean }
  /** Its site is at its containers-at-once ceiling; `siteName` as people read it. */
  | { kind: 'slot'; siteName: string | null }
  | { kind: 'noAgent' }
  /** A run on a branch waits for the other runs in its project's container to end. */
  | { kind: 'branch' }

/** One row of the Runs panel: a task's run, or a run in one of the person's conversations. */
export type MyRun = {
  /** The session's id once a run has happened, else the task's. */
  key: string
  group: MyRunGroup
  kind: 'task' | 'conversation'
  sessionId: string | null
  /** The task's title, or the conversation's. */
  title: string
  /** The task's key (WEB-27); a conversation has none. */
  ref: string | null
  /** Where a click on the row leads: the task, or the conversation. */
  href: string
  /** The project, or Chat for a conversation in the person's own space. */
  place: { name: string; projectKey: string | null }
  task: { id: string; runState: string } | null
  agent: { id: string; name: string; handle: string; avatarUrl: string | null } | null
  startedBy: RunStarter
  onBehalfOf: { id: string; name: string } | null
  startedByMe: boolean
  onMyBehalf: boolean
  /** Who started it, only when it was not the viewer: "started by automation", "started by Ana". */
  startedByText: string | null
  /** Stopped on a tool request the panel can answer. */
  wantsApproval: boolean
  /** Why a queued run waits; the client turns it into words. */
  wait: RunWaitNote | null
  /** The state its second line ends with: what it waits for, or how it ended. */
  state: string | null
  startedAt: string | null
  endedAt: string | null
  updatedAt: string
  siteSilence: SiteSilence | null
}

/** A run on the Runs screen's list, or a task waiting in the queue (which has no run yet). */
export type RunListItem = {
  /** The run's id; null for a queued task. */
  runId: string | null
  /** The run's session, which tells hq which site to ask for the run; null for a queued task. */
  sessionId: string | null
  group: MyRunGroup
  kind: 'task' | 'conversation'
  /** The task's title, or the conversation's. */
  title: string
  /** The task's key (WEB-27); a conversation has none. */
  ref: string | null
  /** The task, or the conversation. */
  href: string
  place: { name: string; projectKey: string | null }
  agent: { id: string; name: string; handle: string; avatarUrl: string | null } | null
  /** How it ended or what it waits for, in a few words ("completed", "failed — the build broke"). */
  outcome: string | null
  /** The risky calls (High and Flagged) its audit summary counts, when it has finished. */
  riskyCalls: number | null
  /** Why a queued task waits; the client turns it into words. */
  wait: RunWaitNote | null
  /** Who started it, only when it was not the viewer. */
  startedByText: string | null
  startedAt: string | null
  endedAt: string | null
  /** When it happened, newest first: its start, else its creation. */
  at: string
}

export type RunsPageResult = {
  runs: RunListItem[]
  /** Continues the list from where this page stopped; null when there is nothing older. */
  nextCursor: string | null
  /** Sites whose runs are missing from this page. */
  unanswered: SiteSilence[]
}

export const RUN_WHEN = ['any', 'day', 'week', 'month'] as const
export const RUN_ENDED = ['any', 'completed', 'failed', 'stopped'] as const
export const RUN_RELATION = ['all', 'started', 'behalf'] as const

/** What narrows the Runs screen's list (all optional; absent means no narrowing). */
export type RunsFilters = {
  relation?: (typeof RUN_RELATION)[number]
  when?: (typeof RUN_WHEN)[number]
  /** A project's key. */
  place?: string
  agentId?: string
  ended?: (typeof RUN_ENDED)[number]
  search?: string
  /** Only the runs of this conversation: its workers' and the tasks it commissioned. */
  conversationId?: string
}

export type RunsPageArgs = RunsFilters & { cursor?: string }

/** The request a run made, and how it was answered. */
export type RunRequestDetail = {
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'
  tools: string[]
  bashPatterns: string[]
  summary: string | null
  answeredAt: string | null
  /** Who approved or denied it, as the reader sees them ("you", a name); null when not recorded. */
  decidedBy: string | null
  /** Still the newest run of its task or conversation, so it can be approved or denied. */
  current: boolean
}

/** One run opened in full. */
export type RunDetail = {
  runId: string
  sessionId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  group: MyRunGroup
  outcome: string | null
  error: string | null
  kind: 'task' | 'conversation'
  title: string
  ref: string | null
  href: string
  place: { name: string; projectKey: string | null }
  agent: { id: string; name: string; handle: string; avatarUrl: string | null } | null
  /** "by automation, for you" — what started it and for whom. */
  startedByLine: string | null
  /** Claude Code or OpenCode; null when the session recorded none. */
  runtime: string | null
  model: string
  usage: TokenUsage | null
  site: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  request: RunRequestDetail | null
  /** What an earlier run asked for and a person approved, which this run was given: its calls that used it asked first. */
  approvalGiven: { tools: string[]; bashPatterns: string[]; by: string | null; at: string | null } | null
  riskyCalls: number | null
}

export type GetRunDetailArgs = { runId: string; sessionId: string }
export type GetToolCallOutputArgs = { runId: string; sessionId: string; toolUseId: string }

export type ToolCallOutput =
  | { recorded: false }
  | { recorded: true; output: string; truncated: boolean }

// ── A run's request for tools and commands, and its calls ──

export type GetToolCallLogArgs = { runId: string; sessionId: string }
export type GetSessionPendingManifestArgs = { sessionId: string }
export type ApproveManifestArgs = { runId: string; sessionId?: string }
export type RejectManifestArgs = { runId: string; reason: string; sessionId?: string }

export type ToolRiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'FLAGGED'

/** One of a run's tool calls (`getToolCallLog`), in the order it was made. */
export type ToolCallView = {
  id: string
  runId: string
  toolName: string
  /** What the agent called the tool with, as the harness gave it. */
  toolInput: JsonValue
  /** The harness's own id for the call, which finds its output; null when the site recorded none. */
  toolUseId: string | null
  riskLevel: ToolRiskLevel
  blocked: boolean
  blockReason: string | null
  createdAt: string
}

/** A session's request for tools and commands that still waits for a person (`getSessionPendingManifest`). */
export type PendingManifestView = {
  runId: string
  sessionId: string
  summary: string | null
  pendingManifest: ManifestPendingApprovalClientEvent['pendingManifest']
}

/** What approving or denying a request answers once it is done; a refusal is an HTTP error instead. */
export type ManifestAnswerResult = { ok: boolean }
