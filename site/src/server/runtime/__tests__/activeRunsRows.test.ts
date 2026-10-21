/**
 * `run.listActive` (person-scoped execution spec §3, task 2.18/2.21) — site's
 * own read: a boundary's PENDING/RUNNING AgentRun rows, joined to their
 * AgentSession by the session's primary owner. Ids, status and times only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: { agentRun: { findMany: mockFindMany } },
}))

import { listActiveRuns } from '../activeRunsRows'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listActiveRuns @person-scoped-execution', () => {
  it('filters by status PENDING/RUNNING and by the session primary owner', async () => {
    mockFindMany.mockResolvedValue([])

    await listActiveRuns({ ownerType: 'project', ownerId: 'proj-1' })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['PENDING', 'RUNNING'] },
          session: { primaryOwnerType: 'project', primaryOwnerId: 'proj-1' },
        },
      }),
    )
  })

  it('carries ids, status and times only — never inputText/outputText/title', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'run-1', sessionId: 'sess-1', agentId: 'agent-1', taskId: null,
        status: 'RUNNING', startedAt: new Date('2026-09-28T10:00:00.000Z'), createdAt: new Date('2026-09-28T09:59:00.000Z'),
      },
    ])

    const result = await listActiveRuns({ ownerType: 'project', ownerId: 'proj-1' })

    expect(result).toEqual({
      runs: [{
        runId: 'run-1', sessionId: 'sess-1', agentId: 'agent-1', taskId: null,
        status: 'RUNNING', startedAt: '2026-09-28T10:00:00.000Z', createdAt: '2026-09-28T09:59:00.000Z',
      }],
    })
    // The select clause itself is the content guard — this asserts against it
    // directly rather than only against the output shape above.
    const call = mockFindMany.mock.calls[0][0]
    expect(call.select).toEqual({
      id: true, sessionId: true, agentId: true, taskId: true, status: true, startedAt: true, createdAt: true,
    })
  })

  it('a PENDING run with no startedAt yet reports startedAt: null', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'run-2', sessionId: 'sess-2', agentId: 'agent-1', taskId: 'task-1', status: 'PENDING', startedAt: null, createdAt: new Date('2026-09-28T09:00:00.000Z') },
    ])

    const result = await listActiveRuns({ ownerType: 'user', ownerId: 'user-1' })

    expect(result.runs[0]).toMatchObject({ status: 'PENDING', startedAt: null, taskId: 'task-1' })
  })

  it('an empty boundary answers an empty list, not an error', async () => {
    mockFindMany.mockResolvedValue([])
    await expect(listActiveRuns({ ownerType: 'user', ownerId: 'user-1' })).resolves.toEqual({ runs: [] })
  })
})
