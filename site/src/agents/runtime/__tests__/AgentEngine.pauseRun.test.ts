import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `cancelRun`'s `'paused'` (host-management spec §14): a scheduled change is about to happen. A run
 * not started yet is cancelled at once; a running one finishes its step and is stopped at its next tool call — or,
 * when no call comes, at the pause's deadline — recorded as paused so hq carries it on afterwards.
 */
const mockPrisma = vi.hoisted(() => ({
  agentRun: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  transcriptEntry: { deleteMany: vi.fn() },
}))
vi.mock('#db', () => ({ prisma: mockPrisma }))
const stream = vi.hoisted(() => ({ status: vi.fn(), stream: vi.fn(), waiting: vi.fn() }))
vi.mock('../SiteStreamEmitter', () => ({ siteStream: stream }))

import { SCHEDULED_CHANGE_PAUSE_LEAD_MS } from '@agenthix/core'
import { agentEngine } from '../AgentEngine'
import { gatePausing, gateRunStopped, reachGatePause, resetGateRunsForTests } from '../toolGateRuns'

const BY = 'the scheduled upgrade of lab'
const PAUSED = { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Paused for the scheduled upgrade of lab.' }

describe('AgentEngine.cancelRun — paused', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGateRunsForTests()
    mockPrisma.agentRun.update.mockResolvedValue({})
  })
  afterEach(() => vi.useRealTimers())

  it('cancels a run not started yet at once, as paused, and tells hq', async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.agentRun.findUnique.mockResolvedValue({ sessionId: 's1', taskId: 't1', agentId: 'a1' })
    await agentEngine.cancelRun('run-1', 'paused', BY)

    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({ where: { id: 'run-1', status: 'PENDING' }, data: PAUSED })
    expect(stream.status).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', taskId: 't1', status: 'CANCELLED', error: PAUSED.error }))
    expect(mockPrisma.transcriptEntry.deleteMany).not.toHaveBeenCalled()
    expect(gatePausing('run-1')).toBe(false)
  })

  it('leaves a running run on its step, and stops it as paused when its next tool call reaches the gate', async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 0 })
    await agentEngine.cancelRun('run-2', 'paused', BY)

    expect(mockPrisma.agentRun.update).not.toHaveBeenCalled()
    expect(gateRunStopped('run-2')).toBe(false)
    expect(gatePausing('run-2')).toBe(true)

    expect(reachGatePause('run-2')).toBe(true)
    await vi.waitFor(() => expect(mockPrisma.agentRun.update).toHaveBeenCalledWith({ where: { id: 'run-2' }, data: PAUSED }))
    expect(gateRunStopped('run-2')).toBe(true)
  })

  it('stops a running run that makes no tool call by the pause deadline', async () => {
    vi.useFakeTimers()
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 0 })
    await agentEngine.cancelRun('run-3', 'paused', BY)

    await vi.advanceTimersByTimeAsync(SCHEDULED_CHANGE_PAUSE_LEAD_MS - 1000)
    expect(mockPrisma.agentRun.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockPrisma.agentRun.update).toHaveBeenCalledWith({ where: { id: 'run-3' }, data: PAUSED })
  })
})
