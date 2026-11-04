import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), stepUpdateMany: vi.fn() }))
vi.mock('wasp/server', () => ({
  prisma: {
    workflowRun: { findUnique: db.findUnique, findMany: db.findMany, updateMany: db.updateMany },
    workflowStepRun: { updateMany: db.stepUpdateMany },
  },
}))
vi.mock('../../secrets/store', () => ({ recordPrinted: vi.fn() }))
vi.mock('../integrationValues', () => ({ revokeMintedTokens: vi.fn() }))
const emit = vi.hoisted(() => vi.fn())
vi.mock('../runsLive', () => ({ emitWorkflowRunChanged: emit, notifyRunEnded: vi.fn() }))
vi.mock('../runsPrinted', () => ({ tellAdministratorsOfPrintedSecret: vi.fn() }))

import { refreshRunFromSite, refreshRunsOfSite } from '../runsEvents'

const live = { id: 'r1', workflowId: 'w1', siteId: 's1', agentRunId: null, placeType: 'project', placeId: 'p1', failureCode: null, workflow: { name: 'x' } }

beforeEach(() => vi.clearAllMocks())

describe('refreshing a run from its site', () => {
  it('moves a waiting run to running and tells the screens when the site says it is running', async () => {
    db.findUnique.mockResolvedValue({ ...live, state: 'WAITING' })
    const get = vi.fn().mockResolvedValue({ runId: 'r1', state: 'running', steps: [], result: null })
    await refreshRunFromSite('r1', { get })
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', state: 'WAITING' }, data: expect.objectContaining({ state: 'RUNNING' }) }))
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', state: 'RUNNING' }))
  })

  it('leaves a running run alone when nothing changed', async () => {
    db.findUnique.mockResolvedValue({ ...live, state: 'RUNNING' })
    await refreshRunFromSite('r1', { get: vi.fn().mockResolvedValue({ runId: 'r1', state: 'running', steps: [], result: null }) })
    expect(db.updateMany).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('a site that comes back', () => {
  it('refreshes each run it holds in progress, one failing not stopping the rest', async () => {
    db.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }])
    db.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ ...live, id: where.id, state: 'RUNNING' }))
    const get = vi.fn().mockRejectedValueOnce(new Error('gone')).mockResolvedValueOnce(null)
    await refreshRunsOfSite('s1', { get })
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { siteId: 's1', state: { in: ['WAITING', 'RUNNING'] } } }))
    expect(get).toHaveBeenCalledTimes(2)
  })
})
