import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ HttpError: class extends Error {}, prisma: {} }))
vi.mock('../../secrets/store', () => ({ recordUse: vi.fn() }))

import { recordUseOfAcceptedRun } from '../runsUse'

describe('recording the secrets of a started run', () => {
  it('does not fail the start when the record cannot be written', async () => {
    const record = vi.fn().mockRejectedValue(new Error('database down'))
    await expect(recordUseOfAcceptedRun({ type: 'project', id: 'p1' }, 'r1', ['TOKEN'], 'u1', record)).resolves.toBeUndefined()
    expect(record).toHaveBeenCalledWith({ type: 'project', id: 'p1' }, 'r1', ['TOKEN'], 'u1')
  })
})
