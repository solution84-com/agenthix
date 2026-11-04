import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RUNTIME_METHODS } from '@agenthix/core'
import { startChannelHarness, type ChannelHarness } from './channelHarness'

// Same shape as channelRequests.test.ts: a real ws server and the real
// HqConnectionManager dialling it, so these tests exercise the actual
// channel.request → handleChannelRequest → channelMethods path, not a
// hand-rolled stand-in for it. Only the database (via prisma, for the
// connection bootstrap) and the runtime row modules (the channel handlers'
// only collaborators) are mocked.
const findFirstHqConnection = vi.hoisted(() => vi.fn())
const findFirstSiteConfig = vi.hoisted(() => vi.fn())
const updateManyHqConnection = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: findFirstHqConnection, updateMany: updateManyHqConnection },
    siteConfig: { findFirst: findFirstSiteConfig },
  },
}))

const upsertSessionFromSeed = vi.hoisted(() => vi.fn())
const getSession = vi.hoisted(() => vi.fn())
const renameSession = vi.hoisted(() => vi.fn())
const archiveSession = vi.hoisted(() => vi.fn())
const deleteSession = vi.hoisted(() => vi.fn())
const deleteSessionsBy = vi.hoisted(() => vi.fn())
const clearSessionRuns = vi.hoisted(() => vi.fn())

vi.mock('../../runtime/sessionRows', () => ({
  upsertSessionFromSeed,
  getSession,
  renameSession,
  archiveSession,
  deleteSession,
  deleteSessionsBy,
  clearSessionRuns,
  sessionSelectorWhere: (where: { agentId?: string }) => ({ agentId: where.agentId }),
}))

const order = vi.hoisted(() => [] as string[])
const endConversations = vi.hoisted(() => vi.fn(async (_where: unknown) => { order.push('end') }))
vi.mock('../../runtime/conversationEnding', () => ({ endConversations }))

const getRun = vi.hoisted(() => vi.fn())
const listRuns = vi.hoisted(() => vi.fn())
const countRuns = vi.hoisted(() => vi.fn())
const statsRuns = vi.hoisted(() => vi.fn())

vi.mock('../../runtime/runRows', () => ({ getRun, listRuns, countRuns, statsRuns }))

const listActiveRuns = vi.hoisted(() => vi.fn())
vi.mock('../../runtime/activeRunsRows', () => ({ listActiveRuns }))

const listTranscript = vi.hoisted(() => vi.fn())
vi.mock('../../runtime/transcriptRows', () => ({ listTranscript }))

const listToolCalls = vi.hoisted(() => vi.fn())
vi.mock('../../runtime/toolCallRows', () => ({ listToolCalls }))

import { channelMethods } from '../channelMethods'
import { SESSION_DELETE_MANY_EMPTY_SELECTOR_MESSAGE } from '../runtimeChannelMethods'

// These tests start a live channel harness; on a loaded machine the default 5 s is not enough (#138).
vi.setConfig({ testTimeout: 20_000 })

let harness: ChannelHarness

beforeEach(async () => {
  vi.clearAllMocks()
  harness = await startChannelHarness({ findFirstHqConnection, findFirstSiteConfig, updateManyHqConnection })
})

afterEach(async () => {
  await harness.stop()
})

function ask(method: string, requestId: string, params: unknown = {}) {
  return harness.ask(method, requestId, params)
}

const validSeed = {
  id: 'sess-1',
  sessionKey: 'key-1',
  agentId: 'agent-1',
  userId: 'user-1',
  sessionType: 'chat' as const,
  taskId: null,
  title: null,
  model: null,
  metadata: {},
  primaryOwnerType: null,
  primaryOwnerId: null,
  primaryWorkspaceId: null,
  runtime: 'claude-sdk',
  createdAt: '2026-01-01T00:00:00.000Z',
}

// Dispatch methods arrive with the runtime in task 8 — not registered yet.
// Referenced via RUNTIME_METHODS rather than raw strings so a rename there
// fails this file to compile instead of silently going stale.
const DISPATCH_METHODS_NOT_YET_REGISTERED = [
  RUNTIME_METHODS.runDispatch,
  RUNTIME_METHODS.runCancel,
  RUNTIME_METHODS.runReject,
  RUNTIME_METHODS.agentStop,
  RUNTIME_METHODS.agentPromptPreview,
]

describe('session/run/transcript/toolcall reads over the control channel @SC-344', () => {
  it('registers every runtime lifecycle/read method the channel map exposes', () => {
    for (const method of Object.values(RUNTIME_METHODS)) {
      if ((DISPATCH_METHODS_NOT_YET_REGISTERED as string[]).includes(method)) continue
      expect(channelMethods[method]).toBeTypeOf('function')
    }
  })

  it('session.create validates a full seed and delegates to upsertSessionFromSeed', async () => {
    upsertSessionFromSeed.mockResolvedValue(undefined)
    const ok = await ask(RUNTIME_METHODS.sessionCreate, 'r1', validSeed)
    expect(ok.type).toBe('channel.response')
    expect(ok.payload).toEqual({ ok: true })
    expect(upsertSessionFromSeed).toHaveBeenCalledWith(validSeed)

    // Legible-rejection shape: one line, names the method and the offending
    // field path — no raw ZodError JSON blob.
    const bad = await ask(RUNTIME_METHODS.sessionCreate, 'r2', { ...validSeed, id: undefined })
    expect(bad.type).toBe('channel.error')
    expect(bad.payload).toMatchObject({ code: 'handler_failed' })
    const badMessage = (bad.payload as { message: string }).message
    expect(badMessage).toContain(RUNTIME_METHODS.sessionCreate)
    expect(badMessage).toContain('id')
    expect(badMessage.split('\n')).toHaveLength(1)

    const badDate = await ask(RUNTIME_METHODS.sessionCreate, 'r2b', { ...validSeed, createdAt: 'not-a-date' })
    expect(badDate.type).toBe('channel.error')
    expect(badDate.payload).toMatchObject({ code: 'handler_failed' })
    const badDateMessage = (badDate.payload as { message: string }).message
    expect(badDateMessage).toContain(RUNTIME_METHODS.sessionCreate)
    expect(badDateMessage).toContain('createdAt')
    expect(badDateMessage.split('\n')).toHaveLength(1)
  })

  it('session.get delegates and returns the row (or null)', async () => {
    getSession.mockResolvedValue({ id: 'sess-1' })
    const msg = await ask(RUNTIME_METHODS.sessionGet, 'r3', { id: 'sess-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ id: 'sess-1' })
    expect(getSession).toHaveBeenCalledWith('sess-1')
  })

  it('session.get ignores an unknown key and does not pass it on @SC-1153', async () => {
    getSession.mockResolvedValue(null)
    const msg = await ask(RUNTIME_METHODS.sessionGet, 'r3b', { id: 'x', bogus: 1 })
    expect(msg.type).toBe('channel.response')
    expect(getSession).toHaveBeenCalledWith('x')
  })

  it('run.get delegates to getRun', async () => {
    getRun.mockResolvedValue(null)
    const msg = await ask(RUNTIME_METHODS.runGet, 'r4', { id: 'run-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toBeNull()
    expect(getRun).toHaveBeenCalledWith('run-1')
  })

  it('run.list round-trips a filter to the row module and returns its rows', async () => {
    const rows = [{ id: 'run-1' }, { id: 'run-2' }]
    listRuns.mockResolvedValue(rows)
    const filter = { sessionId: 'sess-1', activeOnly: true, limit: 5 }
    const msg = await ask(RUNTIME_METHODS.runList, 'r5', filter)
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual(rows)
    expect(listRuns).toHaveBeenCalledWith(filter)
  })

  it('run.count round-trips a filter to the row module', async () => {
    countRuns.mockResolvedValue({ count: 3 })
    const filter = { sessionId: 'sess-1', activeOnly: true }
    const msg = await ask(RUNTIME_METHODS.runCount, 'r6', filter)
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ count: 3 })
    expect(countRuns).toHaveBeenCalledWith(filter)
  })

  it('run.count accepts (and discards) a limit — one RunListFilter object works for both list and count', async () => {
    countRuns.mockResolvedValue({ count: 7 })
    const msg = await ask(RUNTIME_METHODS.runCount, 'r6b', { sessionId: 'sess-1', limit: 5 })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ count: 7 })
    expect(countRuns).toHaveBeenCalledWith({ sessionId: 'sess-1' })
  })

  it('transcript.list defaults to 500 (no tail) and caps its limit at 1000', async () => {
    listTranscript.mockResolvedValue([])

    await ask(RUNTIME_METHODS.transcriptList, 'r7', { sessionId: 'sess-1' })
    expect(listTranscript).toHaveBeenLastCalledWith('sess-1', { limit: 500, tail: undefined })

    await ask(RUNTIME_METHODS.transcriptList, 'r8', { sessionId: 'sess-1', limit: 9999 })
    expect(listTranscript).toHaveBeenLastCalledWith('sess-1', { limit: 1000, tail: undefined })

    await ask(RUNTIME_METHODS.transcriptList, 'r9', { sessionId: 'sess-1', limit: 50 })
    expect(listTranscript).toHaveBeenLastCalledWith('sess-1', { limit: 50, tail: undefined })
  })

  it('transcript.list rejects a non-positive limit at the boundary instead of inverting the ordering', async () => {
    const msg = await ask(RUNTIME_METHODS.transcriptList, 'r9b', { sessionId: 'sess-1', limit: 0 })
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'handler_failed' })
    expect(listTranscript).not.toHaveBeenCalled()
  })

  it('transcript.list forwards tail: true and still caps at 1000 — finding 1', async () => {
    listTranscript.mockResolvedValue([])

    await ask(RUNTIME_METHODS.transcriptList, 'r9c', { sessionId: 'sess-1', tail: true, limit: 1000 })
    expect(listTranscript).toHaveBeenLastCalledWith('sess-1', { limit: 1000, tail: true })

    await ask(RUNTIME_METHODS.transcriptList, 'r9d', { sessionId: 'sess-1', tail: true, limit: 5000 })
    expect(listTranscript).toHaveBeenLastCalledWith('sess-1', { limit: 1000, tail: true })
  })

  it('toolcall.list delegates to listToolCalls', async () => {
    const rows = [{ id: 'tc-1' }]
    listToolCalls.mockResolvedValue(rows)
    const msg = await ask(RUNTIME_METHODS.toolCallList, 'r10', { runId: 'run-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual(rows)
    expect(listToolCalls).toHaveBeenCalledWith('run-1')
  })

  it('run.stats delegates to statsRuns with no params', async () => {
    const stats = { totalRuns: 3, completedRuns: 2, failedRuns: 1, runningRuns: 0, totalTokens: 900, perAgent: [] }
    statsRuns.mockResolvedValue(stats)
    const msg = await ask(RUNTIME_METHODS.runStats, 'r11', {})
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual(stats)
    expect(statsRuns).toHaveBeenCalledWith()
  })

  it('run.stats ignores an unknown key @SC-1153', async () => {
    const msg = await ask(RUNTIME_METHODS.runStats, 'r11b', { bogus: 1 })
    expect(msg.type).toBe('channel.response')
    expect(statsRuns).toHaveBeenCalledWith()
  })

  it('run.listActive round-trips a boundary to the row module and returns its rows', async () => {
    const result = { runs: [{ runId: 'run-1', sessionId: 'sess-1', agentId: 'agent-1', taskId: null, status: 'RUNNING', startedAt: null, createdAt: '2026-01-01T00:00:00.000Z' }] }
    listActiveRuns.mockResolvedValue(result)
    const msg = await ask(RUNTIME_METHODS.runListActive, 'r12', { ownerType: 'project', ownerId: 'proj-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual(result)
    expect(listActiveRuns).toHaveBeenCalledWith({ ownerType: 'project', ownerId: 'proj-1' })
  })

  it('run.listActive rejects an unknown ownerType', async () => {
    const msg = await ask(RUNTIME_METHODS.runListActive, 'r12b', { ownerType: 'org', ownerId: 'x' })
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'handler_failed' })
    expect(listActiveRuns).not.toHaveBeenCalled()
  })

  it('run.listActive ignores an unknown key and does not pass it on @SC-1153', async () => {
    listActiveRuns.mockResolvedValue({ runs: [] })
    const msg = await ask(RUNTIME_METHODS.runListActive, 'r12c', { ownerType: 'user', ownerId: 'u1', bogus: 1 })
    expect(msg.type).toBe('channel.response')
    expect(listActiveRuns).toHaveBeenCalledWith({ ownerType: 'user', ownerId: 'u1' })
  })
})

describe('session delete semantics over the control channel @SC-346', () => {
  it('session.delete on a missing id resolves { deleted: false }, not an error frame', async () => {
    deleteSession.mockResolvedValue(false)
    const msg = await ask(RUNTIME_METHODS.sessionDelete, 'd1', { id: 'does-not-exist' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ deleted: false })
  })

  it('session.deleteMany refuses an empty selector with an error frame naming the hazard', async () => {
    const msg = await ask(RUNTIME_METHODS.sessionDeleteMany, 'd2', {})
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'handler_failed', message: SESSION_DELETE_MANY_EMPTY_SELECTOR_MESSAGE })
    expect(deleteSessionsBy).not.toHaveBeenCalled()
  })

  it('session.deleteMany with a narrowing selector delegates to deleteSessionsBy', async () => {
    deleteSessionsBy.mockResolvedValue(2)
    const msg = await ask(RUNTIME_METHODS.sessionDeleteMany, 'd3', { agentId: 'agent-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ deleted: 2 })
    expect(deleteSessionsBy).toHaveBeenCalledWith({ agentId: 'agent-1' })
  })

  // adr-0083: a deleted conversation's processes, harness and staging go with it.
  it('session.delete ends the conversation before its row goes', async () => {
    order.length = 0
    deleteSession.mockImplementation(async () => { order.push('delete'); return true })
    const msg = await ask(RUNTIME_METHODS.sessionDelete, 'd6', { id: 's1' })
    expect(msg.payload).toEqual({ deleted: true })
    expect(endConversations).toHaveBeenCalledWith({ id: 's1' })
    expect(order).toEqual(['end', 'delete'])
  })

  it('session.deleteMany ends every conversation its selector names before the rows go', async () => {
    order.length = 0
    deleteSessionsBy.mockImplementation(async () => { order.push('delete'); return 1 })
    await ask(RUNTIME_METHODS.sessionDeleteMany, 'd7', { agentId: 'agent-2' })
    expect(endConversations).toHaveBeenCalledWith({ agentId: 'agent-2' })
    expect(order).toEqual(['end', 'delete'])
  })

  it('session.rename and session.archive return { updated: false } for a missing id', async () => {
    renameSession.mockResolvedValue(false)
    archiveSession.mockResolvedValue(false)
    const rename = await ask(RUNTIME_METHODS.sessionRename, 'd4', { id: 'nope', title: 'X' })
    expect(rename.payload).toEqual({ updated: false })
    const archive = await ask(RUNTIME_METHODS.sessionArchive, 'd5', { id: 'nope' })
    expect(archive.payload).toEqual({ updated: false })
  })

  it('session.clearRuns delegates and returns the deleted count', async () => {
    clearSessionRuns.mockResolvedValue(4)
    const msg = await ask(RUNTIME_METHODS.sessionClearRuns, 'd6', { id: 'sess-1' })
    expect(msg.type).toBe('channel.response')
    expect(msg.payload).toEqual({ deleted: 4 })
  })
})

describe('an unrecognized method is still refused explicitly @SC-344', () => {
  it('answers a runtime-shaped but unregistered method with unknown_method', async () => {
    const msg = await ask('session.nonsense', 'u1')
    expect(msg.type).toBe('channel.error')
    expect(msg.payload).toMatchObject({ code: 'unknown_method' })
  })
})
