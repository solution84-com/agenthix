import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `cancelRun`'s `reason` param (follow-up to person-scoped execution spec
 * §2): an ordinary Stop still records "Cancelled by user"; hq's
 * interrupt-if-busy path passes `reason: 'interrupted'`, which must record
 * "Interrupted by a new message" instead, so the two are distinguishable in
 * the run's history.
 */
const mockPrisma = vi.hoisted(() => ({
  agentRun: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  transcriptEntry: { deleteMany: vi.fn() },
}))
vi.mock('#db', () => ({ prisma: mockPrisma }))
const gate = vi.hoisted(() => ({ stopGateRun: vi.fn() }))
vi.mock('../toolGateRuns', () => gate)
const stream = vi.hoisted(() => ({ status: vi.fn(), stream: vi.fn(), waiting: vi.fn() }))
vi.mock('../SiteStreamEmitter', () => ({ siteStream: stream }))

import { agentEngine } from '../AgentEngine'

describe('AgentEngine.cancelRun @SC-523', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.agentRun.update.mockResolvedValue({})
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 1 })
  })

  it('records "Cancelled by user" when no reason is given (the Stop button)', async () => {
    await agentEngine.cancelRun('run-1')

    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Cancelled by user' },
    })
  })

  it('records "Interrupted by a new message" when reason is "interrupted"', async () => {
    await agentEngine.cancelRun('run-2', 'interrupted')

    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-2', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Interrupted by a new message' },
    })
  })

  it('records who stopped or interrupted the run when hq names them', async () => {
    await agentEngine.cancelRun('run-4', undefined, 'ana')
    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-4', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Stopped by ana' },
    })
    await agentEngine.cancelRun('run-5', 'interrupted', 'ben')
    expect(mockPrisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'run-5', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Interrupted by ben' },
    })
  })

  it('stops the gate for the run before anything else, so no pending call can be allowed after the stop', async () => {
    mockPrisma.agentRun.updateMany.mockImplementation(async () => {
      expect(gate.stopGateRun).toHaveBeenCalledWith('run-3')
      return { count: 1 }
    })
    await agentEngine.cancelRun('run-3')
    expect(gate.stopGateRun).toHaveBeenCalledTimes(1)
  })

  it('withdraws a message still waiting: its run is cancelled before it starts and the message leaves the transcript', async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.agentRun.findUnique.mockResolvedValue({ sessionId: 's1', taskId: null, agentId: 'a1' })
    await agentEngine.cancelRun('run-6', 'withdrawn', 'ana')

    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-6', status: 'PENDING' },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Withdrawn by ana' },
    })
    expect(mockPrisma.transcriptEntry.deleteMany).toHaveBeenCalledWith({ where: { runId: 'run-6', role: 'USER' } })
    expect(stream.status).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-6', sessionId: 's1', status: 'CANCELLED' }))
    expect(gate.stopGateRun).not.toHaveBeenCalled()
  })

  it('stops a withdrawn message\'s run as by Stop once it has started, keeping the message', async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 0 })
    await agentEngine.cancelRun('run-7', 'withdrawn', 'ana')

    expect(mockPrisma.transcriptEntry.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-7', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: expect.any(Date), error: 'Stopped by ana' },
    })
  })

  it('leaves a run that has already ended as it ended: a late or repeated Stop does not rewrite it', async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 0 })
    await agentEngine.cancelRun('run-8')
    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-8', status: { in: ['PENDING', 'RUNNING'] } },
    }))
    expect(mockPrisma.agentRun.update).not.toHaveBeenCalled()
  })
})
