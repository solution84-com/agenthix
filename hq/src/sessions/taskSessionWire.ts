/**
 * A task's session as the client protocol declares it (`TaskSessionView` in `@agenthix/core/client`): built field
 * by field from hq's session row and the record its site keeps, so neither a database column nor a field the site
 * adds reaches a client until it is declared there. The session's `sessionKey` and `metadata` stay in hq: they are
 * what a run is dispatched with.
 */
import type { AgentSession } from 'wasp/entities'
import type {
  JsonValue, RunRow, TaskSessionEntry, TaskSessionRun, TaskSessionView, TranscriptEntryDetail, TranscriptRow,
} from '@agenthix/core'
import type { ConversationFacts, ConversationRow } from './conversationRecord'
import type { WithAuthorName } from './transcriptAuthors'

export type RecordRow = ConversationRow<WithAuthorName<TranscriptRow>>

// The site sends these over JSON, so what arrives is JSON; its own type says `unknown` only because a tool's
// input and output, and a kind's detail, have no single shape.
const json = (v: unknown): JsonValue => (v === undefined ? null : (v as JsonValue))

export function taskSessionEntry(e: RecordRow): TaskSessionEntry {
  return {
    id: e.id, sessionId: e.sessionId, role: e.role, authorId: e.authorId, authorName: e.authorName,
    content: e.content, thought: e.thought, thinkingDurationMs: e.thinkingDurationMs, toolName: e.toolName,
    toolInput: json(e.toolInput), toolOutput: json(e.toolOutput), model: e.model, usage: e.usage,
    toolUseId: e.toolUseId, runId: e.runId, kind: e.kind,
    detail: e.detail === null || e.detail === undefined ? null : (e.detail as TranscriptEntryDetail),
    runStatus: e.runStatus,
    approval: e.approval
      ? {
          status: e.approval.status, request: json(e.approval.request), decidedById: e.approval.decidedById,
          decidedAt: e.approval.decidedAt, reason: e.approval.reason,
        }
      : null,
    createdAt: e.createdAt,
    ...(e.approvalCard !== undefined ? { approvalCard: e.approvalCard } : {}),
    ...(e.summarisedBy !== undefined ? { summarisedBy: e.summarisedBy } : {}),
    ...(e.summarisedByYou !== undefined ? { summarisedByYou: e.summarisedByYou } : {}),
  }
}

export function taskSessionRun(r: Pick<RunRow, 'id' | 'status' | 'createdAt' | 'endedAt' | 'usage'> & { startedBy: string | null }): TaskSessionRun {
  return { id: r.id, status: r.status, createdAt: r.createdAt, endedAt: r.endedAt, usage: r.usage, startedBy: r.startedBy }
}

export function taskSessionView(
  s: AgentSession,
  record: { entries: RecordRow[]; conversation: ConversationFacts },
  runs: TaskSessionRun[],
): TaskSessionView {
  const { conversation: c } = record
  return {
    id: s.id, agentId: s.agentId, userId: s.userId, title: s.title, status: s.status, sessionType: s.sessionType,
    model: s.model, totalInputTokens: s.totalInputTokens, totalOutputTokens: s.totalOutputTokens,
    totalCacheReadTokens: s.totalCacheReadTokens, totalCacheWriteTokens: s.totalCacheWriteTokens,
    createdAt: s.createdAt, updatedAt: s.updatedAt, taskId: s.taskId,
    primaryOwnerType: s.primaryOwnerType, primaryOwnerId: s.primaryOwnerId, primaryWorkspaceId: s.primaryWorkspaceId,
    closedReason: s.closedReason, runtime: s.runtime, conversationId: s.conversationId,
    workerGeneration: s.workerGeneration,
    entries: record.entries.map(taskSessionEntry),
    conversation: { replies: c.replies, failed: c.failed, latestFailure: c.latestFailure, contextUse: c.contextUse },
    AgentRun: runs.map(taskSessionRun),
  }
}
