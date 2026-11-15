import { vi } from 'vitest'
import {
  parseRunPageCursor,
  runFeedKey,
  type RunRow,
  type RunUsageRow,
  type SessionRow,
  type ToolCallRow,
  type TranscriptRow,
} from '@agenthix/core'
import type * as Real from '../../sessions/siteRuntimeStore'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

// What the real module exports besides functions. Small and pure, so copied rather than imported: importing
// the real module here would load the channel and database code the fake exists to keep out of a unit test.
export const TITLE_MAX_LENGTH = 500
export function truncateTitle(title: string | null): string | null {
  if (title === null) return null
  return title.length > TITLE_MAX_LENGTH ? title.slice(0, TITLE_MAX_LENGTH) : title
}
export const DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE =
  'siteRuntimeStore.deleteSessionsBy requires at least one of userId, taskId, agentId, or ids — refusing to send an empty selector across the wire'
export type SessionDeleteManySelector = Real.SessionDeleteManySelector

type Site = {
  sessions: Map<string, SessionRow>
  runs: RunRow[]
  transcripts: Map<string, TranscriptRow[]>
  toolCalls: Map<string, ToolCallRow[]>
}

const sites = new Map<string, Site>()
// A site made unreachable fails with the given error, or with the real `SiteUnreachableError` when none is given.
const unreachable = new Map<string, Error | null>()

/** Every `dispatchRun` since the last reset, with the site it went to. */
export const dispatchedRuns: Array<{ siteId: string; payload: Parameters<typeof Real.dispatchRun>[1] }> = []
/** Every run `cancelRun` was asked to cancel since the last reset, with who stopped it when named. */
export const cancelledRuns: Array<{ siteId: string; runId: string; reason?: string; by?: string }> = []
/** Every agent handle `stopAgent` was asked to stop since the last reset. */
export const stoppedAgents: Array<{ siteId: string; handle: string }> = []

let counter = 0

function site(siteId: string): Site {
  let s = sites.get(siteId)
  if (!s) {
    s = { sessions: new Map(), runs: [], transcripts: new Map(), toolCalls: new Map() }
    sites.set(siteId, s)
  }
  return s
}

/** Every call to a site made unreachable fails as the real store does when the channel is down. */
async function reach(siteId: string): Promise<Site> {
  if (unreachable.has(siteId)) {
    // Loaded here, not at the top: workspaceStore leads back to this module, so a top-level import would wait on itself.
    const { SiteUnreachableError } = await import('../../storage/workspaceStore')
    throw unreachable.get(siteId) ?? new SiteUnreachableError(siteId, siteId)
  }
  return site(siteId)
}

const now = () => new Date().toISOString()

// ── Arranging a case ───────────────────────────────────────────────────────

export function addSession(siteId: string, partial: Partial<SessionRow> & { id: string }): SessionRow {
  const row: SessionRow = {
    sessionKey: `key-${partial.id}`, agentId: 'agent-1', userId: 'user-1', title: null, status: 'ACTIVE', closedReason: null,
    runtime: null, sessionType: 'chat', model: null, metadata: {}, totalInputTokens: 0, totalOutputTokens: 0,
    totalCacheReadTokens: 0, totalCacheWriteTokens: 0, createdAt: now(), updatedAt: now(), taskId: null,
    primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null, contextUse: null, ...partial,
  }
  site(siteId).sessions.set(row.id, row)
  return row
}

export function addRun(siteId: string, partial: Partial<RunRow> & { id: string }): RunRow {
  const row: RunRow = {
    agentId: 'agent-1', sessionId: 'session-1', taskId: null, status: 'COMPLETED',
    inputText: '', outputText: null, model: 'model-1', error: null, usage: null,
    manifestStatus: null, pendingManifest: null, approvedManifest: null, manifestDecidedById: null, manifestDecidedAt: null, contextUse: null,
    auditSummary: null,
    metadata: null, startedAt: null, endedAt: null, createdAt: now(), agentPackageDigest: null, orgPackageDigest: null,
    platformPackageDigest: null, ...partial,
  }
  site(siteId).runs.push(row)
  return row
}

export function addTranscript(siteId: string, sessionId: string, rows: Array<Partial<TranscriptRow>>): void {
  const list = site(siteId).transcripts.get(sessionId) ?? []
  for (const partial of rows) {
    list.push({
      id: `entry-${++counter}`, sessionId, role: 'USER', authorId: null, content: '', thought: null, thinkingDurationMs: null, toolName: null,
      toolInput: null, toolOutput: null, model: null, usage: null, toolUseId: null, runId: null, kind: null, detail: null,
      runStatus: null, approval: null, createdAt: now(), ...partial,
    })
  }
  site(siteId).transcripts.set(sessionId, list)
}

export function addToolCalls(siteId: string, runId: string, rows: ToolCallRow[]): void {
  site(siteId).toolCalls.set(runId, [...(site(siteId).toolCalls.get(runId) ?? []), ...rows])
}

/** Every call for this site fails as when its channel is down (`SiteUnreachableError`), or with the error given. */
export function makeSiteUnreachable(siteId: string, error?: Error): void {
  unreachable.set(siteId, error ?? null)
}

export function makeSiteReachable(siteId: string): void {
  unreachable.delete(siteId)
}

// ── The module's functions ─────────────────────────────────────────────────

export const createSession: Spy<typeof Real.createSession> = vi.fn(async (siteId, seed) => {
  await reach(siteId)
  addSession(siteId, { ...seed, title: truncateTitle(seed.title) })
  return { ok: true }
})

export const getSession: Spy<typeof Real.getSession> = vi.fn(async (siteId, id) => (await reach(siteId)).sessions.get(id) ?? null)

export const renameSession: Spy<typeof Real.renameSession> = vi.fn(async (siteId, id, title) => {
  const row = (await reach(siteId)).sessions.get(id)
  if (row) row.title = truncateTitle(title)
  return { updated: !!row }
})

export const archiveSession: Spy<typeof Real.archiveSession> = vi.fn(async (siteId, id) => {
  const row = (await reach(siteId)).sessions.get(id)
  if (row) row.status = 'ARCHIVED'
  return { updated: !!row }
})

export const deleteSession: Spy<typeof Real.deleteSession> = vi.fn(async (siteId, id) => {
  const s = await reach(siteId)
  const had = s.sessions.delete(id)
  s.runs = s.runs.filter((r) => r.sessionId !== id)
  s.transcripts.delete(id)
  return { deleted: had }
})

export const deleteSessionsBy: Spy<typeof Real.deleteSessionsBy> = vi.fn(async (siteId, selector) => {
  if (selector.userId === undefined && selector.taskId === undefined && selector.agentId === undefined && selector.ids === undefined) {
    throw new Error(DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE)
  }
  const s = await reach(siteId)
  const doomed = [...s.sessions.values()].filter(
    (row) =>
      (selector.userId === undefined || row.userId === selector.userId) &&
      (selector.taskId === undefined || row.taskId === selector.taskId) &&
      (selector.agentId === undefined || row.agentId === selector.agentId) &&
      (selector.ids === undefined || selector.ids.includes(row.id)),
  )
  for (const row of doomed) {
    s.sessions.delete(row.id)
    s.runs = s.runs.filter((r) => r.sessionId !== row.id)
    s.transcripts.delete(row.id)
  }
  return { deleted: doomed.length }
})

export const clearSessionRuns: Spy<typeof Real.clearSessionRuns> = vi.fn(async (siteId, id) => {
  const s = await reach(siteId)
  const before = s.runs.length
  s.runs = s.runs.filter((r) => r.sessionId !== id)
  return { deleted: before - s.runs.length }
})

function matching(s: Site, filter: Parameters<typeof Real.listRuns>[1] & { taskIds?: string[]; sessionIds?: string[] }): RunRow[] {
  return s.runs
    .filter(
      (r) =>
        (filter.sessionId === undefined || r.sessionId === filter.sessionId) &&
        (filter.taskId === undefined || r.taskId === filter.taskId) &&
        (filter.sessionIds === undefined || filter.sessionIds.includes(r.sessionId)) &&
        (filter.taskIds === undefined || (r.taskId !== null && filter.taskIds.includes(r.taskId))) &&
        (filter.agentId === undefined || r.agentId === filter.agentId) &&
        (!filter.activeOnly || r.status === 'PENDING' || r.status === 'RUNNING'),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

export const getRun: Spy<typeof Real.getRun> = vi.fn(async (siteId, id) => (await reach(siteId)).runs.find((r) => r.id === id) ?? null)

export const listRuns: Spy<typeof Real.listRuns> = vi.fn(async (siteId, filter) => {
  const rows = matching(await reach(siteId), filter)
  return filter.limit === undefined ? rows : rows.slice(0, filter.limit)
})

export const listRunsPage: Spy<typeof Real.listRunsPage> = vi.fn(async (siteId, params) => {
  const cursor = parseRunPageCursor(params.before)
  const ordered = matching(await reach(siteId), params).sort((a, b) => {
    const [ka, kb] = [runFeedKey(a), runFeedKey(b)]
    return ka !== kb ? (ka < kb ? 1 : -1) : a.id < b.id ? 1 : -1
  })
  const after = cursor
    ? ordered.filter((r) => runFeedKey(r) < cursor.at || (runFeedKey(r) === cursor.at && r.id < cursor.id))
    : ordered
  const runs = after.slice(0, params.limit)
  const last = runs[runs.length - 1]
  const more = after.length > runs.length
  return { runs, nextBefore: more && last ? `${runFeedKey(last)}|${last.id}` : null }
})

export const countRuns: Spy<typeof Real.countRuns> = vi.fn(async (siteId, filter) => ({
  count: matching(await reach(siteId), { ...filter, limit: undefined }).length,
}))

export const listTranscript: Spy<typeof Real.listTranscript> = vi.fn(async (siteId, sessionId, opts) => {
  const all = (await reach(siteId)).transcripts.get(sessionId) ?? []
  const rows = opts?.toolUseIds ? all.filter((r) => r.role === 'TOOL' && r.toolUseId && opts.toolUseIds!.includes(r.toolUseId)) : all
  if (opts?.limit === undefined) return [...rows]
  return opts.tail ? rows.slice(-opts.limit) : rows.slice(0, opts.limit)
})

export const listToolCalls: Spy<typeof Real.listToolCalls> = vi.fn(async (siteId, runId) => (await reach(siteId)).toolCalls.get(runId) ?? [])

export const runStats: Spy<typeof Real.runStats> = vi.fn(async (siteId) => {
  const runs = (await reach(siteId)).runs
  const tokens = (r: RunRow) => r.usage?.totalTokens ?? 0
  const perAgent = new Map<string, { agentId: string; runCount: number; totalTokens: number }>()
  for (const r of runs) {
    const entry = perAgent.get(r.agentId) ?? { agentId: r.agentId, runCount: 0, totalTokens: 0 }
    entry.runCount += 1
    entry.totalTokens += tokens(r)
    perAgent.set(r.agentId, entry)
  }
  return {
    totalRuns: runs.length,
    completedRuns: runs.filter((r) => r.status === 'COMPLETED').length,
    failedRuns: runs.filter((r) => r.status === 'FAILED').length,
    runningRuns: runs.filter((r) => r.status === 'RUNNING').length,
    totalTokens: runs.reduce((sum, r) => sum + tokens(r), 0),
    perAgent: [...perAgent.values()],
  }
})

// The fake does not know which person or organisation owns a run, so it answers with every pending or running run.
export const listActiveRuns: Spy<typeof Real.listActiveRuns> = vi.fn(async (siteId) => ({
  runs: (await reach(siteId)).runs
    .filter((r): r is RunRow & { status: 'PENDING' | 'RUNNING' } => r.status === 'PENDING' || r.status === 'RUNNING')
    .map((r) => ({ runId: r.id, sessionId: r.sessionId, agentId: r.agentId, taskId: r.taskId, status: r.status, startedAt: r.startedAt, createdAt: r.createdAt })),
}))

/** `run.usage` summed over the fake's runs, grouped as the site groups them; the person comes from the run's dispatch metadata. */
export const runUsage: Spy<typeof Real.runUsage> = vi.fn(async (siteId, params) => {
  const s = await reach(siteId)
  const groups = new Map<string, RunUsageRow>()
  for (const r of s.runs) {
    if (params.agentId !== undefined && r.agentId !== params.agentId) continue
    if (params.since !== undefined && r.createdAt < params.since) continue
    if (params.until !== undefined && r.createdAt >= params.until) continue
    const session = s.sessions.get(r.sessionId)
    const dispatch = (r.metadata as { dispatch?: { onBehalfOfUserId?: string } } | null)?.dispatch
    const key: Pick<RunUsageRow, 'agentId' | 'sessionId' | 'model' | 'onBehalfOfUserId' | 'ownerType' | 'ownerId'> = {
      agentId: params.by === 'owner' ? null : r.agentId,
      sessionId: params.by === 'session' ? r.sessionId : null,
      model: params.by === 'session' ? r.model : null,
      onBehalfOfUserId: params.by === 'session' ? dispatch?.onBehalfOfUserId ?? null : null,
      ownerType: params.by === 'owner' ? session?.primaryOwnerType ?? null : null,
      ownerId: params.by === 'owner' ? session?.primaryOwnerId ?? null : null,
    }
    const id = JSON.stringify(key)
    const at = r.startedAt ?? r.createdAt
    const row = groups.get(id) ?? {
      ...key, runCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, lastRunAt: at,
    }
    row.runCount += 1
    row.inputTokens += r.usage?.inputTokens ?? 0
    row.outputTokens += r.usage?.outputTokens ?? 0
    row.cacheReadTokens += r.usage?.cacheReadTokens ?? 0
    row.cacheWriteTokens += r.usage?.cacheWriteTokens ?? 0
    row.totalTokens += r.usage?.totalTokens ?? 0
    if (at > row.lastRunAt) row.lastRunAt = at
    groups.set(id, row)
  }
  return { rows: [...groups.values()].sort((a, b) => b.lastRunAt.localeCompare(a.lastRunAt)), truncated: false }
})

export const dispatchRun: Spy<typeof Real.dispatchRun> = vi.fn(async (siteId, payload) => {
  await reach(siteId)
  const runId = `run-${++counter}`
  dispatchedRuns.push({ siteId, payload })
  addRun(siteId, {
    id: runId, agentId: payload.context.agent.id, sessionId: payload.session.id, taskId: payload.session.taskId,
    status: 'PENDING', inputText: payload.inputText, model: payload.model,
    // As the site records it: what started the run and, when named, who it is for.
    metadata: { dispatch: { kind: payload.kind, startedBy: payload.startedBy, ...(payload.onBehalfOfUserId ? { onBehalfOfUserId: payload.onBehalfOfUserId } : {}) } },
  })
  return { runId, sessionId: payload.session.id }
})

export const cancelRun: Spy<typeof Real.cancelRun> = vi.fn(async (siteId, runId, reason, by) => {
  const run = (await reach(siteId)).runs.find((r) => r.id === runId)
  if (run && (run.status === 'PENDING' || run.status === 'RUNNING')) run.status = 'CANCELLED'
  cancelledRuns.push({ siteId, runId, ...(reason ? { reason } : {}), ...(by ? { by } : {}) })
})

export const approveRun: Spy<typeof Real.approveRun> = vi.fn(async (siteId, runId) => {
  const run = (await reach(siteId)).runs.find((r) => r.id === runId)
  if (run?.manifestStatus !== 'PENDING_APPROVAL') return { approved: false }
  run.manifestStatus = 'APPROVED'
  return { approved: true }
})


export const rejectRun: Spy<typeof Real.rejectRun> = vi.fn(async (siteId, runId) => {
  const run = (await reach(siteId)).runs.find((r) => r.id === runId)
  if (run) run.manifestStatus = 'REJECTED'
})

/** Every request `replaceRequest` was asked to replace since the last reset. */
export const replacedRequests: Array<{ siteId: string; runId: string }> = []

export const replaceRequest: Spy<typeof Real.replaceRequest> = vi.fn(async (siteId, runId) => {
  const run = (await reach(siteId)).runs.find((r) => r.id === runId)
  if (run?.manifestStatus === 'PENDING_APPROVAL') run.manifestStatus = 'SUPERSEDED'
  replacedRequests.push({ siteId, runId })
})

export const stopAgent: Spy<typeof Real.stopAgent> = vi.fn(async (siteId, handle) => {
  await reach(siteId)
  stoppedAgents.push({ siteId, handle })
})

export const removeAgentDirectory: Spy<typeof Real.removeAgentDirectory> = vi.fn(async (siteId) => {
  await reach(siteId)
  return { removed: true }
})

export const promptPreview: Spy<typeof Real.promptPreview> = vi.fn(async (siteId) => {
  await reach(siteId)
  return { prompt: '' }
})

const spies = [
  createSession, getSession, renameSession, archiveSession, deleteSession, deleteSessionsBy, clearSessionRuns, getRun, listRuns,
  listRunsPage, countRuns, listTranscript, listToolCalls, runStats, listActiveRuns, runUsage, dispatchRun, cancelRun, approveRun,
  rejectRun, replaceRequest, stopAgent, removeAgentDirectory, promptPreview,
]

export function reset(): void {
  sites.clear()
  unreachable.clear()
  dispatchedRuns.length = 0
  cancelledRuns.length = 0
  replacedRequests.length = 0
  stoppedAgents.length = 0
  counter = 0
  for (const spy of spies) spy.mockReset()
}

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./siteRuntimeStore')> extends never ? true : never = true
