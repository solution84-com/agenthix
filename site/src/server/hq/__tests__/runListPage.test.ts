/**
 * `run.listPage`'s wire boundary — what this handler accepts off the channel
 * and what it refuses.
 *
 * Only that. What the method actually returns is decided by a query with an
 * expression in its ORDER BY and a row-value comparison in its WHERE, and a
 * mocked database can only ever confirm that the code says what it says.
 * `runtime/__tests__/runListPage.integration.test.ts` runs it against a real
 * one, which is the test that can tell whether a page is ever lost.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The handler's siblings in this module reach the database on import, so the
// site's Prisma client is stubbed; nothing here touches it.
vi.mock('#db', () => ({ prisma: {} }))

const listRunsPage = vi.hoisted(() => vi.fn())
vi.mock('../../runtime/runRows', () => ({ listRunsPage }))

import { runListPage } from '../runtimeChannelMethods'

beforeEach(() => {
  vi.clearAllMocks()
  listRunsPage.mockResolvedValue({ runs: [], nextBefore: null })
})

describe('run.listPage at the wire boundary @SC-778', () => {
  it('passes the filter, the page size and the cursor through as given', async () => {
    await runListPage({ limit: 25, agentId: 'a1', activeOnly: true, before: '2026-01-05T00:00:00.000Z|r5' })

    expect(listRunsPage).toHaveBeenCalledWith({
      limit: 25,
      agentId: 'a1',
      activeOnly: true,
      before: '2026-01-05T00:00:00.000Z|r5',
    })
  })

  it('passes a list of task ids through, and refuses an empty id or a non-list', async () => {
    await runListPage({ limit: 10, taskIds: ['t1', 't2'] })
    expect(listRunsPage).toHaveBeenCalledWith({ limit: 10, taskIds: ['t1', 't2'] })

    await expect(runListPage({ limit: 10, taskIds: ['t1', ''] })).rejects.toThrow(/run\.listPage/)
    await expect(runListPage({ limit: 10, taskIds: 't1' })).rejects.toThrow(/run\.listPage/)
  })

  it('passes a list of session ids through, and refuses an empty id or a non-list', async () => {
    await runListPage({ limit: 10, sessionIds: ['s1', 's2'] })
    expect(listRunsPage).toHaveBeenCalledWith({ limit: 10, sessionIds: ['s1', 's2'] })

    await expect(runListPage({ limit: 10, sessionIds: ['s1', ''] })).rejects.toThrow(/run\.listPage/)
    await expect(runListPage({ limit: 10, sessionIds: 's1' })).rejects.toThrow(/run\.listPage/)
  })

  it('hands a cursor on without inspecting it, so the format stays core\'s to define', async () => {
    await runListPage({ limit: 10, before: 'nonsense-with-no-separator' })

    expect(listRunsPage).toHaveBeenCalledWith({ limit: 10, before: 'nonsense-with-no-separator' })
  })

  it('returns the page exactly as the row module built it', async () => {
    listRunsPage.mockResolvedValue({ runs: [{ id: 'r5' }], nextBefore: '2026-01-05T00:00:00.000Z|r5' })

    await expect(runListPage({ limit: 1 })).resolves.toEqual({
      runs: [{ id: 'r5' }],
      nextBefore: '2026-01-05T00:00:00.000Z|r5',
    })
  })

  it('ignores a param it does not recognise and passes the rest on @SC-1153', async () => {
    listRunsPage.mockResolvedValue({ runs: [], nextBefore: null })
    await runListPage({ limit: 10, offset: 20 })
    expect(listRunsPage).toHaveBeenCalledWith({ limit: 10 })
  })

  it('refuses a call with no page size — the caller states it, this method never guesses', async () => {
    await expect(runListPage({})).rejects.toThrow(/run\.listPage/)
    expect(listRunsPage).not.toHaveBeenCalled()
  })
})
