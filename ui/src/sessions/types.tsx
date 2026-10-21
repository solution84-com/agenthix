import type { ReactNode } from 'react'
import type { ApprovalAnswer, ApprovalItem, ContextUse, JsonValue, LatestFailure, TranscriptEntryKind, TranscriptRow } from '@agenthix/core'

export type RenderMarkdown = (props: { content: string; className?: string }) => ReactNode

/** Default fallback when no renderMarkdown is provided. */
export function defaultRenderMarkdown({ content, className }: { content: string; className?: string }): ReactNode {
  return <pre className={`whitespace-pre-wrap font-mono text-small ${className ?? ''}`}>{content}</pre>
}

// ── Manifest approval types ─────────────────────────────────────────────────

interface ManifestItem {
  name?: string
  pattern?: string
  reason?: string
}

export interface PendingManifestData {
  runId: string
  sessionId: string
  summary: string | null
  pendingManifest: {
    tools: ManifestItem[]
    bashPatterns: ManifestItem[]
  }
}

// ── Transcript types ────────────────────────────────────────────────────────

export type LiveToolCall = {
  toolUseId: string
  toolName: string
  toolInput: JsonValue
  output?: string
  status: 'running' | 'done'
  /** When the call was made, as an ISO string. */
  at?: string
}

export type TranscriptEntry = {
  id: string
  role: string
  content: string
  thought: string | null
  thinkingDurationMs: number | null
  toolName: string | null
  toolInput: JsonValue
  toolOutput: JsonValue
  model: string | null
  createdAt: string | Date
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; totalTokens: number } | null
  /** Who sent a person's message; set by hq on USER rows. */
  authorName?: string | null
  /** The harness's id for a TOOL line's call. */
  toolUseId?: string | null
  /** The run that wrote the row (for a USER row, the run its message started); Details opens it. */
  runId?: string | null
  /** On a SYSTEM row: what it records. */
  kind?: TranscriptEntryKind | null
  detail?: TranscriptRow['detail']
  /** On a USER row: `PENDING` while the message waits behind a running reply. */
  runStatus?: string | null
  /** On an approval request: the request and its answer in plain words. */
  approvalCard?: ApprovalCardData | null
  /** On a summary marker: who asked, and whether it was the viewer. */
  summarisedBy?: string | null
  summarisedByYou?: boolean
}

/** An approval request as the conversation shows it (hq `conversationRecord.ts`). */
export type ApprovalCardData = {
  answer: ApprovalAnswer
  items: ApprovalItem[]
  decidedBy: string | null
  decidedByYou: boolean
  decidedAt: string | null
  reason: string | null
  allowedFor: 'this_run'
}

/** What the conversation read adds to its rows. */
export type ConversationFacts = {
  replies: number
  failed: number
  latestFailure: LatestFailure | null
  contextUse: ContextUse | null
}

// ── Activity session detail types (PanelActivitySession) ────────────────────

export interface ActivitySessionAgent {
  id: string
  name: string
  handle: string
  avatarUrl: string | null
}

export interface ActivitySessionRun {
  id: string
  status: string
  manifestStatus?: string | null
}

export interface ActivitySessionTask {
  id: string
  title: string
  number: number
  project: { key: string }
}

export interface ActivitySessionDetail {
  id: string
  status: string
  sessionType: string | null
  model: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  agent: ActivitySessionAgent | null
  task: ActivitySessionTask | null
  entries: TranscriptEntry[]
  AgentRun: ActivitySessionRun[]
  conversation?: ConversationFacts
}

// ── Task session types (PanelActivityList) ───────────────────────────────────

export interface TaskSessionRun {
  id: string
  status: string
  startedAt: string | null
  endedAt: string | null
  /** Present on runs that require approval before executing. */
  manifestStatus?: string | null
}

export interface TaskSession {
  id: string
  updatedAt: string
  status: string
  sessionType: string | null
  agent: {
    id: string
    name: string
    handle: string
    avatarUrl: string | null
  } | null
  task: {
    id: string
    title: string
    runState: string
    number: number
    project: { key: string }
  } | null
  AgentRun: TaskSessionRun[]
}

// ── Session list types (PanelSessionList) ────────────────────────────────────

export interface SessionListItem {
  id: string
  title: string | null
  status: string
  agent: { id: string; name: string; handle: string; avatarUrl: string | null } | null
  updatedAt: string
  createdAt: string
  entries?: { content: string }[]
}

// ── PanelChatView session types ───────────────────────────────────────────────

export interface SessionAgent {
  id: string
  name: string
  handle?: string
  avatarUrl: string | null
  voiceEnabled: boolean
  runtime?: string
  defaultModel?: string
  voiceId?: string | null
  voiceTtsModel?: string | null
}

/** Where a session works (ADR-0039 §8) — shown as the chat's context badge. */
export interface SessionLocationDisplay {
  ownerType: 'project' | 'user'
  ownerName: string
  label: string
  kind: 'files' | 'workspace' | 'task'
  href: string | null
}

export interface SessionDetail {
  id: string
  title: string | null
  status: string
  model: string | null
  /** The runtime the conversation started on (adr-0078); absent on older rows. */
  runtime?: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  /** Arbitrary metadata (e.g. welcomeMessage). */
  metadata: Record<string, unknown> | null
  agent: SessionAgent | null
  entries: TranscriptEntry[]
  /** Replies, failures, Try again's failure and the agent's memory; absent from a read that does not carry them. */
  conversation?: ConversationFacts
  /** When it started. */
  createdAt?: string | Date
  /** Resolved working context for the chat's context badge. */
  primaryLocation?: SessionLocationDisplay | null
}
