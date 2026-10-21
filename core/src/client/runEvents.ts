/**
 * The run events hq sends a client in a session's or a task's room. hq builds each from the site's report of its
 * run, field by field, so what a client reads is hq's declared shape, not whatever the site sent.
 */

export const RUN_CLIENT_SOCKET = {
  /** To the session's room: a run started or ended, from the site's status report. */
  runStatus: 'agentRunStatus',
  /** To the session's room: text the run has just written. */
  streamDelta: 'agentStreamDelta',
  /** To the task's room: the session a task run works in exists now, before the run does. */
  taskSessionStarted: 'taskSessionStarted',
  /** A run ended waiting for a person to approve the tools and commands it asked for. */
  manifestPendingApproval: 'manifestPendingApproval',
} as const

export type RunStatusClientEvent = {
  runId: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  error?: string
}
export type RunStreamDeltaClientEvent = { runId: string; textDelta: string }
export type TaskSessionStartedClientEvent = { sessionId: string }
/** `taskId`: null for a chat run. `summary`: why the run asked, for a task run; null for a chat run. */
export type ManifestPendingApprovalClientEvent = {
  runId: string
  sessionId: string
  taskId: string | null
  summary: string | null
  pendingManifest: {
    tools: { name: string; reason?: string }[]
    bashPatterns: { pattern: string; reason?: string }[]
  }
}
