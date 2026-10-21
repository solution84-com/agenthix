import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunListFilter, RunListPageParams, SessionSeed, TranscriptListParams } from '@agenthix/core'

/**
 * The runtime channel methods validate their params with zod schemas written by
 * hand beside core's types, and a schema drops a field it does not list. Two drifts follow,
 * neither of which either app's type check sees:
 *
 *  - core ADDS a field hq starts sending — the schema drops it silently;
 *  - core DROPS a field the schema still requires — hq's call stops matching.
 *
 * (The handlers' `satisfies` clauses cover only the schema-to-core direction,
 * and an optional field on core's side passes them either way.) Each fixture
 * below is therefore typed as core's own type — `Required<…>` where the type has
 * optional fields, so a field added to core breaks compilation HERE and cannot
 * be left out — and is then sent through the real handler. The row modules are
 * mocked; what is asserted is that the schema let the call through unchanged.
 *
 * Modelled on server/runtime/__tests__/dispatchParams.drift.test.ts, which does
 * the same for `run.dispatch`.
 */
const upsertSessionFromSeed = vi.hoisted(() => vi.fn())
const listRuns = vi.hoisted(() => vi.fn())
const listRunsPage = vi.hoisted(() => vi.fn())
const countRuns = vi.hoisted(() => vi.fn())
const listTranscript = vi.hoisted(() => vi.fn())

vi.mock('../../runtime/sessionRows', () => ({ upsertSessionFromSeed }))
vi.mock('../../runtime/runRows', () => ({ listRuns, listRunsPage, countRuns }))
vi.mock('../../runtime/transcriptRows', () => ({ listTranscript }))
vi.mock('../../runtime/toolCallRows', () => ({}))
vi.mock('../../runtime/activeRunsRows', () => ({}))
vi.mock('../../runtime/conversationEnding', () => ({ endConversations: vi.fn() }))

import { sessionCreate, runList, runListPage, runCount, transcriptList } from '../runtimeChannelMethods'

beforeEach(() => {
  vi.clearAllMocks()
  listRuns.mockResolvedValue([])
  listRunsPage.mockResolvedValue({ runs: [], nextBefore: null })
  countRuns.mockResolvedValue({ count: 0 })
  listTranscript.mockResolvedValue([])
})

const seed: Required<SessionSeed> = {
  id: 's1',
  sessionKey: 'chat:agent-1:u1',
  agentId: 'agent-1',
  userId: 'u1',
  sessionType: 'task',
  taskId: 't1',
  title: 'A title',
  model: 'claude-sonnet-4-6',
  metadata: { source: 'test' },
  primaryOwnerType: 'user',
  primaryOwnerId: 'u1',
  primaryWorkspaceId: 'w1',
  runtime: 'claude-sdk',
  createdAt: '2026-09-16T00:00:00.000Z',
}

const filter: Required<RunListFilter> = {
  sessionId: 's1',
  taskId: 't1',
  agentId: 'agent-1',
  activeOnly: true,
  limit: 25,
}

const page: Required<RunListPageParams> = { ...filter, limit: 25, before: 'cursor-from-core', taskIds: ['t1', 't2'], sessionIds: ['s1', 's2'] }

const transcript: Required<TranscriptListParams> = { sessionId: 's1', limit: 200, tail: true, toolUseIds: ['toolu_1'] }

describe('runtime channel params agree with the types core declares', () => {
  it('session.create accepts every field of SessionSeed and hands the seed on untouched', async () => {
    await expect(sessionCreate(seed)).resolves.toEqual({ ok: true })
    expect(upsertSessionFromSeed).toHaveBeenCalledWith(seed)
  })

  it('session.create ignores a field core does not declare @SC-1153', async () => {
    await expect(sessionCreate({ ...seed, extra: 1 })).resolves.toEqual({ ok: true })
    expect(upsertSessionFromSeed).toHaveBeenCalledWith(seed)
  })

  it('run.list accepts every field of RunListFilter', async () => {
    await runList(filter)
    expect(listRuns).toHaveBeenCalledWith(filter)
  })

  it('run.count accepts the same RunListFilter object, and drops only its limit', async () => {
    await runCount(filter)
    const { limit: _limit, ...withoutLimit } = filter
    expect(countRuns).toHaveBeenCalledWith(withoutLimit)
  })

  it('run.listPage accepts every field of RunListPageParams', async () => {
    await runListPage(page)
    expect(listRunsPage).toHaveBeenCalledWith(page)
  })

  it('run.listPage still requires the page size core requires', async () => {
    const { limit: _limit, ...withoutLimit } = page
    await expect(runListPage(withoutLimit)).rejects.toThrow(/run\.listPage/)
  })

  it('transcript.list accepts every field of TranscriptListParams', async () => {
    await transcriptList(transcript)
    expect(listTranscript).toHaveBeenCalledWith('s1', { limit: 200, tail: true, toolUseIds: ['toolu_1'] })
  })
})
