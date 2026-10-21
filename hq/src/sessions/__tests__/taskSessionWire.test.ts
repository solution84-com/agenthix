import { describe, it, expect } from 'vitest'
import type { AgentSession } from 'wasp/entities'
import { taskSessionEntry, taskSessionView, type RecordRow } from '../taskSessionWire'

const at = new Date('2026-10-21T09:00:00Z')

function row(over: Partial<RecordRow> = {}): RecordRow {
  return {
    id: 'e1', sessionId: 's1', role: 'TOOL', authorId: null, authorName: null, content: '', thought: null,
    thinkingDurationMs: null, toolName: 'Read', toolInput: { path: 'a.md' }, toolOutput: undefined as unknown as RecordRow['toolOutput'], model: null,
    usage: null, toolUseId: 'tu1', runId: 'r1', kind: null, detail: null, runStatus: null, approval: null,
    createdAt: '2026-10-21T09:00:00.000Z',
    ...over,
  }
}

const session: AgentSession = {
  id: 's1', sessionKey: 'dispatch-key', agentId: 'a1', userId: 'u1', title: null, status: 'ACTIVE',
  sessionType: 'task', model: null, metadata: { dispatch: { startedBy: 'person' } }, totalInputTokens: 1,
  totalOutputTokens: 2, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, createdAt: at, updatedAt: at,
  expiresAt: null, taskId: 't1', primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null,
  closedReason: null, runtime: 'claude-sdk', conversationId: null, workerGeneration: 0,
}

describe("a task session's record as the client protocol declares it @SC-1142", () => {
  it('reads a value the site left out as null, and keeps what a tool was given', () => {
    const e = taskSessionEntry(row())
    expect(e.toolInput).toEqual({ path: 'a.md' })
    expect(e.toolOutput).toBeNull()
  })

  it("keeps an approval's request and answer field by field, and hq's additions only where they were made", () => {
    const e = taskSessionEntry(row({
      role: 'SYSTEM', kind: 'APPROVAL_REQUESTED',
      approval: { status: 'PENDING_APPROVAL', request: { tools: [{ name: 'Bash' }] }, decidedById: null, decidedAt: null, reason: null, extra: 1 } as never,
      approvalCard: { answer: 'waiting', items: [], decidedBy: null, decidedByYou: false, decidedAt: null, reason: null, allowedFor: 'this_run' },
    }))
    expect(e.approval).toEqual({ status: 'PENDING_APPROVAL', request: { tools: [{ name: 'Bash' }] }, decidedById: null, decidedAt: null, reason: null })
    expect(e.approvalCard?.answer).toBe('waiting')
    expect(e).not.toHaveProperty('summarisedBy')
  })

  it('leaves the session key and the dispatch metadata in hq, and anything a site row gains', () => {
    const view = taskSessionView(
      session,
      { entries: [{ ...row(), siteAdded: true } as RecordRow], conversation: { replies: 0, failed: 0, latestFailure: null, contextUse: null } },
      [{ id: 'r1', status: 'COMPLETED', createdAt: '2026-10-21T09:00:00.000Z', endedAt: null, usage: null, startedBy: null }],
    )
    expect(view).not.toHaveProperty('sessionKey')
    expect(view).not.toHaveProperty('metadata')
    expect(view.entries[0]).not.toHaveProperty('siteAdded')
    expect(view.AgentRun.map(r => r.id)).toEqual(['r1'])
  })
})
