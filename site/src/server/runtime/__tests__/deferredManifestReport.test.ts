/**
 * Deferred-manifest post-run continuation (plan 5d-2 task 8, hardened round
 * 3; redesigned at the cutover's spec review, BLOCKER 1 — one terminal frame
 * per run). AgentEngine withholds its own terminal `run.status` frame
 * whenever `options.deferredManifest` is non-empty at terminal time — this
 * module discovers that after the run promise settles and sends the run's
 * SINGLE terminal frame: the row update, the `manifestPendingApproval`
 * stream frame, and one `run.status` frame carrying `manifestPending` PLUS
 * whatever the engine withheld (`sessionPatch`, relayed
 * verbatim via `withheldFrame`). The frame's status is `terminalStatus`,
 * supplied by the CALLER — this module never assumes
 * COMPLETED; it relays exactly what it's given.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAgentRunUpdate = vi.hoisted(() => vi.fn())
const mockTranscriptEntryFindFirst = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    agentRun: { update: mockAgentRunUpdate },
    transcriptEntry: { findFirst: mockTranscriptEntryFindFirst },
  },
}))

const mockSiteStreamStatus = vi.hoisted(() => vi.fn())
const mockSiteStreamStream = vi.hoisted(() => vi.fn())
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({
  siteStream: { status: mockSiteStreamStatus, stream: mockSiteStreamStream },
}))

import { reportDeferredManifestIfAny } from '../deferredManifestReport'

beforeEach(() => {
  vi.clearAllMocks()
})

const BASE = { runId: 'run-1', sessionId: 'sess-1', agentId: 'agent-1', agentHandle: 'agent-1-handle' }

describe('an empty collector reports nothing', () => {
  it('no row update, no frames', async () => {
    await reportDeferredManifestIfAny({
      ...BASE, taskId: null, deferredManifest: { tools: [], bashPatterns: [] }, terminalStatus: 'COMPLETED', flavor: 'chat',
    })
    expect(mockAgentRunUpdate).not.toHaveBeenCalled()
    expect(mockSiteStreamStream).not.toHaveBeenCalled()
    expect(mockSiteStreamStatus).not.toHaveBeenCalled()
  })
})

describe('a non-empty collector — chat flavor', () => {
  it('updates the row, sends a session-room manifestPendingApproval frame with no summary, and a second status frame with manifestPending set', async () => {
    mockAgentRunUpdate.mockResolvedValue({})

    const deferredManifest = { tools: [{ name: 'Write', reason: 'needs it' }], bashPatterns: [] }
    await reportDeferredManifestIfAny({ ...BASE, taskId: null, deferredManifest, terminalStatus: 'COMPLETED', flavor: 'chat' })

    expect(mockAgentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { manifestStatus: 'PENDING_APPROVAL', pendingManifest: deferredManifest },
    })

    expect(mockSiteStreamStream).toHaveBeenCalledWith({
      sessionId: 'sess-1', runId: 'run-1', taskId: null, targetRoom: 'session',
      name: 'manifestPendingApproval',
      data: { runId: 'run-1', sessionId: 'sess-1', summary: null, pendingManifest: deferredManifest },
    })

    expect(mockSiteStreamStatus).toHaveBeenCalledWith({
      runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', agentHandle: 'agent-1-handle',
      status: 'COMPLETED', error: null, sessionPatch: null,
      manifestPending: { runId: 'run-1', summary: null, pendingManifest: deferredManifest },
    })
  })

  it('relays the engine\'s withheld sessionPatch verbatim on its own (now single) terminal frame — the run\'s only frame', async () => {
    mockAgentRunUpdate.mockResolvedValue({})

    const deferredManifest = { tools: [{ name: 'Write', reason: 'needs it' }], bashPatterns: [] }
    const withheldFrame = {
      sessionPatch: { totalInputTokens: 42, totalOutputTokens: 7, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 },
    }
    await reportDeferredManifestIfAny({
      ...BASE, taskId: null, deferredManifest, terminalStatus: 'COMPLETED', withheldFrame, flavor: 'chat',
    })

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({
      sessionPatch: withheldFrame.sessionPatch,
    }))
  })

  // A run stopped at its time or turn limit that also asked for approval: hq keeps both reasons on the task.
  it('relays the reason the run was stopped beside the request', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    const error = 'Run limit reached: the run was stopped after its time limit of 60 minutes.'

    await reportDeferredManifestIfAny({
      ...BASE, taskId: 'task-1', deferredManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] },
      terminalStatus: 'CANCELLED', withheldFrame: { sessionPatch: null, error }, flavor: 'task',
    })

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'CANCELLED', error, manifestPending: expect.objectContaining({ runId: 'run-1' }),
    }))
  })

  it('withheldFrame omitted (e.g. a FAILED run that never computed one) falls back to a null sessionPatch', async () => {
    mockAgentRunUpdate.mockResolvedValue({})

    await reportDeferredManifestIfAny({
      ...BASE, taskId: null, deferredManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] },
      terminalStatus: 'FAILED', withheldFrame: undefined, flavor: 'chat',
    })

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ sessionPatch: null }))
  })

  // The whole point of round 3's fix: a run that failed AFTER accumulating a
  // deferred request must relay FAILED here, never an assumed COMPLETED.
  it.each(['FAILED', 'CANCELLED'] as const)('relays %s exactly as given by the caller — never assumes COMPLETED', async (terminalStatus) => {
    mockAgentRunUpdate.mockResolvedValue({})

    await reportDeferredManifestIfAny({
      ...BASE, taskId: null, deferredManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] }, terminalStatus, flavor: 'chat',
    })

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ status: terminalStatus }))
  })
})

describe('a failure before the terminal frame is sent (finding 3) — the run must still finalize', () => {
  it('a rejected prisma.agentRun.update still emits a fallback terminal status frame with manifestPending: null and the true status', async () => {
    const dbError = new Error('db unreachable')
    mockAgentRunUpdate.mockRejectedValue(dbError)

    const deferredManifest = { tools: [{ name: 'Write', reason: 'needs it' }], bashPatterns: [] }
    await expect(
      reportDeferredManifestIfAny({ ...BASE, taskId: null, deferredManifest, terminalStatus: 'COMPLETED', flavor: 'chat' }),
    ).rejects.toBe(dbError)

    // No manifestPendingApproval stream frame — that write never happened.
    expect(mockSiteStreamStream).not.toHaveBeenCalled()

    // But the run's ONLY terminal frame still goes out, with the approval
    // card dropped (manifestPending: null) rather than the run hanging.
    expect(mockSiteStreamStatus).toHaveBeenCalledTimes(1)
    expect(mockSiteStreamStatus).toHaveBeenCalledWith({
      runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', agentHandle: 'agent-1-handle',
      status: 'COMPLETED', error: null, sessionPatch: null, manifestPending: null,
    })
  })

  it('relays the withheld sessionPatch on the fallback frame too', async () => {
    const dbError = new Error('db unreachable')
    mockAgentRunUpdate.mockRejectedValue(dbError)
    const withheldFrame = {
      sessionPatch: { totalInputTokens: 5, totalOutputTokens: 1, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 },
    }

    await expect(
      reportDeferredManifestIfAny({
        ...BASE, taskId: null, deferredManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] },
        terminalStatus: 'FAILED', withheldFrame, flavor: 'chat',
      }),
    ).rejects.toBe(dbError)

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED', manifestPending: null,
      sessionPatch: withheldFrame.sessionPatch,
    }))
  })

  it('a failure in the task-flavor transcript lookup also still sends the fallback frame', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    const dbError = new Error('transcript lookup failed')
    mockTranscriptEntryFindFirst.mockRejectedValue(dbError)

    await expect(
      reportDeferredManifestIfAny({
        ...BASE, taskId: 'task-1', deferredManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] },
        terminalStatus: 'COMPLETED', flavor: 'task',
      }),
    ).rejects.toBe(dbError)

    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', manifestPending: null }))
  })
})

describe('a non-empty collector — task flavor', () => {
  it('targets the task room and derives the summary from the last ASSISTANT transcript entry', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    mockTranscriptEntryFindFirst.mockResolvedValue({ content: 'I finished most of it but need Bash for the last step.' })

    const deferredManifest = { tools: [{ name: 'Bash', reason: 'run tests' }], bashPatterns: [] }
    await reportDeferredManifestIfAny({ ...BASE, taskId: 'task-1', deferredManifest, terminalStatus: 'COMPLETED', flavor: 'task' })

    expect(mockSiteStreamStream).toHaveBeenCalledWith({
      sessionId: 'sess-1', runId: 'run-1', taskId: 'task-1', targetRoom: 'task',
      name: 'manifestPendingApproval',
      data: { runId: 'run-1', taskId: 'task-1', summary: 'I finished most of it but need Bash for the last step.', pendingManifest: deferredManifest },
    })
    expect(mockSiteStreamStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1', status: 'COMPLETED',
      manifestPending: { runId: 'run-1', summary: 'I finished most of it but need Bash for the last step.', pendingManifest: deferredManifest },
    }))
  })

  it('falls back to a computed summary when no transcript entry exists', async () => {
    mockAgentRunUpdate.mockResolvedValue({})
    mockTranscriptEntryFindFirst.mockResolvedValue(null)

    const deferredManifest = { tools: [{ name: 'Bash', reason: 'run tests' }], bashPatterns: [] }
    await reportDeferredManifestIfAny({ ...BASE, taskId: 'task-1', deferredManifest, terminalStatus: 'COMPLETED', flavor: 'task' })

    expect(mockSiteStreamStream).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ summary: 'Bash (run tests)' }),
    }))
  })
})
