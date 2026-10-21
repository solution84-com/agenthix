/**
 * Boot-sweep crash-recovery test (plan 5d-2 task 8, @SC-342): swept runs are
 * buffered, flushed as FAILED frames on the channel's next open, and the
 * buffer is cleared after flushing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAgentRunFindMany = vi.hoisted(() => vi.fn())
const mockAgentRunUpdateMany = vi.hoisted(() => vi.fn())
const mockTranscriptCreateMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }))

vi.mock('#db', () => ({
  prisma: {
    agentRun: { findMany: mockAgentRunFindMany, updateMany: mockAgentRunUpdateMany },
    transcriptEntry: { createMany: mockTranscriptCreateMany },
  },
}))

const mockSiteStreamStatus = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({
  siteStream: { status: mockSiteStreamStatus },
}))

import { runCrashRecoverySweep, flushBootSweepBuffer, bootSweepBuffer, BOOT_SWEEP_ERROR, BOOT_SWEEP_REASON } from '../bootSweep'

beforeEach(() => {
  vi.clearAllMocks()
  bootSweepBuffer.length = 0
})

describe('runCrashRecoverySweep @SC-342', () => {
  it("writes each swept run's failure into its conversation, where the reply would have been @SC-774", async () => {
    mockAgentRunFindMany.mockResolvedValue([{ id: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'a1', status: 'RUNNING' }])
    mockAgentRunUpdateMany.mockResolvedValue({ count: 1 })
    await runCrashRecoverySweep()
    expect(mockTranscriptCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      sessionId: 'sess-1', runId: 'run-1', role: 'SYSTEM', kind: 'RUN_FAILED', detail: { reason: BOOT_SWEEP_REASON },
    })] })
  })

  it('no orphaned runs — nothing swept, nothing buffered', async () => {
    mockAgentRunFindMany.mockResolvedValue([])
    const { swept } = await runCrashRecoverySweep()
    expect(swept).toBe(0)
    expect(mockAgentRunUpdateMany).not.toHaveBeenCalled()
    expect(bootSweepBuffer).toHaveLength(0)
  })

  it('flips orphaned PENDING/RUNNING runs to FAILED and buffers a status event per run', async () => {
    mockAgentRunFindMany.mockResolvedValue([
      // The stored dispatch blob is {kind} only (spec review, HIGH) — it never
      // carried a resolvable handle even before this fix; agentHandle is
      // always the bare agentId, regardless of what metadata holds.
      { id: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', metadata: { dispatch: { kind: 'chat' } } },
      { id: 'run-2', sessionId: 'sess-2', taskId: 'task-1', agentId: 'agent-2', metadata: null },
    ])
    mockAgentRunUpdateMany.mockResolvedValue({ count: 2 })

    const { swept } = await runCrashRecoverySweep()

    expect(swept).toBe(2)
    expect(mockAgentRunUpdateMany).toHaveBeenCalledWith({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', error: BOOT_SWEEP_ERROR, endedAt: expect.any(Date) },
    })
    expect(bootSweepBuffer).toHaveLength(2)
    expect(bootSweepBuffer[0]).toEqual({
      runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', agentHandle: 'agent-1',
      status: 'FAILED', error: BOOT_SWEEP_ERROR, sessionPatch: null, manifestPending: null,
    })
    expect(bootSweepBuffer[1]).toMatchObject({ runId: 'run-2', agentHandle: 'agent-2' })
  })
})

describe('flushBootSweepBuffer @SC-342', () => {
  it('sends every buffered frame and clears the buffer', () => {
    bootSweepBuffer.push(
      { runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', agentHandle: 'h1', status: 'FAILED', error: BOOT_SWEEP_ERROR, sessionPatch: null, manifestPending: null },
      { runId: 'run-2', sessionId: 'sess-2', taskId: null, agentId: 'agent-2', agentHandle: 'h2', status: 'FAILED', error: BOOT_SWEEP_ERROR, sessionPatch: null, manifestPending: null },
    )

    flushBootSweepBuffer()

    expect(mockSiteStreamStatus).toHaveBeenCalledTimes(2)
    expect(mockSiteStreamStatus).toHaveBeenNthCalledWith(1, expect.objectContaining({ runId: 'run-1' }))
    expect(mockSiteStreamStatus).toHaveBeenNthCalledWith(2, expect.objectContaining({ runId: 'run-2' }))
    expect(bootSweepBuffer).toHaveLength(0)
  })

  it('an empty buffer sends nothing', () => {
    flushBootSweepBuffer()
    expect(mockSiteStreamStatus).not.toHaveBeenCalled()
  })
})
