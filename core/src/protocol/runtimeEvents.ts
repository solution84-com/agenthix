/**
 * Runtime events — site → hq, one way.
 *
 * The other half of `runtimeData.ts`, which holds what hq ASKS a site and what
 * the site answers. These go the other way and nobody answers them: a site
 * announces what its runtime just did, and the frames may be lost. Nothing
 * durable rides on one — hq recovers run state by reconciling over `run.list`
 * on reconnect, and the transcript, not the stream, is the record.
 *
 * Split out of `runtimeData.ts` when that file passed the repository's
 * file-size limit. The seam is the direction of travel, which is the seam that
 * file's own header already drew.
 *
 * Type aliases rather than interfaces throughout, for the reason
 * `runtimeData.ts` gives: these cross a Wasp operation's superjson `Payload`,
 * which needs an implicit index signature an interface does not have.
 */
import type { SessionClosedReasonValue } from './sessionState.js'
import type { RunResourceShortage } from './runResource.js'
import type { PendingManifest } from './runManifest.js'
import type { JsonValue } from '../client/json.js'

/**
 * site → hq: run.status event data. Frames may be lost — this event has no
 * transport-level durability; hq recovers by reconciling via `run.list` on
 * reconnect.
 */
export type RunStatusEvent = {
  runId: string
  sessionId: string
  taskId: string | null
  agentId: string
  agentHandle: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  error: string | null
  /**
   * On a FAILED frame, when the run stopped for lack of memory, disk or processes: the cause and the limit it hit
   * (`runResource.ts`). Absent otherwise.
   */
  resource?: RunResourceShortage | null
  /** Site-written session fields to replicate onto hq's copy (D3). */
  sessionPatch: {
    title?: string
    status?: 'ACTIVE' | 'ARCHIVED' | 'CLOSED'
    /** Sent with `status: 'CLOSED'`, and only then. */
    closedReason?: SessionClosedReasonValue
    totalInputTokens?: number
    totalOutputTokens?: number
    totalCacheReadTokens?: number
    totalCacheWriteTokens?: number
  } | null
  /**
   * Deferred-manifest outcome, when the run ended pending approval. The site always sends its request; null only on
   * a frame hq rebuilds from a run that recorded none.
   */
  manifestPending: { runId: string; summary: string | null; pendingManifest: PendingManifest | null } | null
}

/**
 * site → hq: a session's own fields changed with no run to carry them — today
 * a conversation closed because a membership ended (person-scoped execution
 * spec §4), which may happen to a session with no run at all. The same fields
 * and the same one-writer rule as `RunStatusEvent.sessionPatch`; hq applies it
 * only for a session the sending site owns. Lost like any event: the site
 * sends it before acknowledging the membership instruction on the same
 * socket, so an acknowledged instruction's patches have gone out, and a
 * replayed one sends them again.
 */
export const SESSION_PATCH_EVENT = 'session.patch'

export type SessionPatchEvent = {
  sessionId: string
  sessionPatch: NonNullable<RunStatusEvent['sessionPatch']>
}

/**
 * site → hq: a run is waiting for, or has got, one of the site's slots for runs
 * at once (`AGENT_MAX_CONCURRENT_RUNS`). A run that finds the site at its limit
 * sends `waiting: true` and, when a slot frees, `waiting: false`; until then hq
 * sees nothing of it, since the wait happens before the run's RUNNING frame.
 * Lost like any event: hq clears the wait on the run's own status frames too.
 *
 * `reason`: `branch` is a run on a branch's copy waiting for the
 * other runs in its container to end, so the container is made again with the
 * storage's code workspaces read-only. Absent means `slot`.
 */
export const RUN_WAITING_EVENT = 'run.waiting'

export type RunWaitingEvent = {
  runId: string
  sessionId: string
  taskId: string | null
  waiting: boolean
  reason?: RunWaitReason
}

export type RunWaitReason = 'slot' | 'branch'

/** Single source for the run.stream event-name vocabulary — hq's intake
 *  validation (siteEventHandler.ts's validateRunStreamFrame) feeds from this
 *  array, so widening it here widens the validator too, without a second
 *  edit. Same pattern as SESSION_TYPES above and WORKSPACE_OWNER_TYPES in
 *  siteData.ts. */
export const RUN_STREAM_EVENT_NAMES = [
  'agentStreamDelta',
  'agentToolCall',
  'agentToolResult',
  'agentThinking',
  /** A transient line for the live turn (`{ runId, notice }`), such as the provider being retried; replaced by the next one, cleared by output or the run's end. */
  'agentRunNotice',
  'agentRunStatus',
  'manifestPendingApproval',
  'taskSessionStarted',
] as const

export type RunStreamEventName = (typeof RUN_STREAM_EVENT_NAMES)[number]

/** Single source for the run.stream target-room vocabulary — same reason as
 *  RUN_STREAM_EVENT_NAMES above. */
export const RUN_STREAM_TARGET_ROOMS = ['session', 'task'] as const

export type RunStreamTargetRoom = (typeof RUN_STREAM_TARGET_ROOMS)[number]

/**
 * Each `run.stream` frame's `data`, by its `name`. `agentRunStatus` is not here: hq makes that one itself from
 * `run.status`, and refuses it from a site.
 */
export type RunStreamData = {
  agentStreamDelta: { runId: string; textDelta: string }
  /** `toolInput` is the call's input as the harness gave it, arbitrary JSON by design. */
  agentToolCall: { runId: string; toolUseId: string; toolName: string; toolInput: JsonValue }
  agentToolResult: { runId: string; toolUseId: string; output: string }
  agentThinking: { runId: string; thinking: string }
  agentRunNotice: { runId: string; notice: string }
  /** A task run carries its summary; a conversation's carries none (its reply is already above the card). */
  manifestPendingApproval:
    | { runId: string; taskId: string | null; summary: string | null; pendingManifest: PendingManifest }
    | { runId: string; sessionId: string; summary: null; pendingManifest: PendingManifest }
  taskSessionStarted: { sessionId: string }
}

/** The names a site sends on `run.stream`. */
export type SiteRunStreamName = keyof RunStreamData

/**
 * site → hq: run.stream event data — one frame per engine event, relayed
 * verbatim. Frames may be lost — this is ephemeral UI, not the durable
 * record (the transcript is).
 */
export type RunStreamEvent = {
  [N in SiteRunStreamName]: {
    sessionId: string
    /** Null when `name` is 'taskSessionStarted', which fires before the run row exists. */
    runId: string | null
    taskId: string | null
    /** Which socket.io room to relay into — site names it so hq's relay side stays dumb. */
    targetRoom: RunStreamTargetRoom
    /** socket.io event name exactly as the browser listens for it today. */
    name: N
    data: RunStreamData[N]
  }
}[SiteRunStreamName]

export type CredentialHealthEvent = {
  agentHandle: string
  state: 'missing' | 'expired'
  detail: string
}

/**
 * site → hq: a subscription login the harness refreshed during a run, reported
 * against the grant hq named on the run's provider descriptor
 * (`RunProviderDescriptor`'s `grantId`). It covers every subscription, a
 * person's, a project's or the organisation's.
 *
 * The event names no owner. hq looks the grant up in its own records, which
 * say which stored login it handed out and to which site, so a report can only
 * ever update a login hq gave to the site that sends it.
 */
export type SubscriptionRefreshedEvent = {
  grantId: string
  /** The Claude Code OAuth credentials document, as the harness left it. */
  oauthJson: string
  /** claudeAiOauth.expiresAt, epoch ms. */
  expiresAt: number
}
