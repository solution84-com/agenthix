import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunUsageParams } from '@agenthix/core'

/**
 * `run.usage`'s wire boundary: the params core declares pass through unchanged,
 * and anything else is refused before the database is asked. The SQL itself is
 * proved against a real database in runUsageRows.integration.test.ts.
 */
const sumRunUsage = vi.hoisted(() => vi.fn())

vi.mock('../../runtime/runUsageRows', () => ({ sumRunUsage }))
vi.mock('../../runtime/sessionRows', () => ({}))
vi.mock('../../runtime/runRows', () => ({}))
vi.mock('../../runtime/transcriptRows', () => ({}))
vi.mock('../../runtime/toolCallRows', () => ({}))
vi.mock('../../runtime/activeRunsRows', () => ({}))
vi.mock('../../runtime/conversationEnding', () => ({ endConversations: vi.fn() }))

import { runUsage } from '../runtimeChannelMethods'

beforeEach(() => {
  vi.clearAllMocks()
  sumRunUsage.mockResolvedValue({ rows: [], truncated: false })
})

describe('run.usage over the control channel @SC-779', () => {
  it("passes every field core declares through to the sum (a field added to core breaks this fixture's type)", async () => {
    const params: Required<RunUsageParams> = {
      by: 'session',
      agentId: 'agent-1',
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-11-01T00:00:00.000Z',
    }
    await expect(runUsage(params)).resolves.toEqual({ rows: [], truncated: false })
    expect(sumRunUsage).toHaveBeenCalledWith(params)
  })

  it('needs only the grouping', async () => {
    await runUsage({ by: 'owner' })
    expect(sumRunUsage).toHaveBeenCalledWith({ by: 'owner' })
  })

  it.each([
    ['an unknown grouping', { by: 'person' }],
    ['no grouping', {}],
    ['a period bound that is not a timestamp', { by: 'agent', since: 'yesterday' }],
    ['an empty agent id', { by: 'agent', agentId: '' }],
  ])('refuses %s without asking the database', async (_what, params) => {
    await expect(runUsage(params)).rejects.toThrow(/run\.usage/)
    expect(sumRunUsage).not.toHaveBeenCalled()
  })

  it('ignores a field core does not declare and does not pass it on @SC-1153', async () => {
    sumRunUsage.mockResolvedValue({ rows: [], truncated: false })
    await runUsage({ by: 'agent', projectId: 'p1' })
    expect(sumRunUsage).toHaveBeenCalledWith({ by: 'agent' })
  })
})
