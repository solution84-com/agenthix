import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackRunStatus, failRunsForRevokedSite, __resetActiveRunsForTests } from '../activeRuns'

type Io = { to: ReturnType<typeof vi.fn> }
const emit = vi.fn()
const to = vi.fn(() => ({ emit }))

function withIo(): void {
  ;(globalThis as { __wasp_io__?: Io }).__wasp_io__ = { to }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetActiveRunsForTests()
  withIo()
})
afterEach(() => {
  delete (globalThis as { __wasp_io__?: Io }).__wasp_io__
})

describe('failRunsForRevokedSite — R-058', () => {
  it("tells the room of each session with a run still going on the revoked site that the run failed", async () => {
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')
    trackRunStatus({ runId: 'run-2', sessionId: 'sess-2', status: 'RUNNING' }, 'site-1')

    failRunsForRevokedSite('site-1', 'Execution Site revoked')

    expect(to).toHaveBeenCalledWith('session:sess-1')
    expect(to).toHaveBeenCalledWith('session:sess-2')
    expect(emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'FAILED', error: 'Execution Site revoked' })
    expect(emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-2', status: 'FAILED', error: 'Execution Site revoked' })
  })

  it("leaves a run on another site alone", () => {
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')
    trackRunStatus({ runId: 'run-2', sessionId: 'sess-2', status: 'RUNNING' }, 'site-2')

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).toHaveBeenCalledTimes(1)
    expect(to).not.toHaveBeenCalledWith('session:sess-2')
  })

  it('does not announce a run that already finished', () => {
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'COMPLETED' }, 'site-1')

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).not.toHaveBeenCalled()
  })

  it.each(['FAILED', 'CANCELLED'] as const)('does not announce a run that ended %s', (status) => {
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status })

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).not.toHaveBeenCalled()
  })

  it("a late terminal frame for an older run does not clear the session's newer run", () => {
    trackRunStatus({ runId: 'run-new', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')
    trackRunStatus({ runId: 'run-old', sessionId: 'sess-1', status: 'COMPLETED' }, 'site-1')

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).toHaveBeenCalledWith('agentRunStatus', expect.objectContaining({ runId: 'run-new' }))
  })

  it('announces a run once: a second revoke finds nothing left to announce', () => {
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')

    failRunsForRevokedSite('site-1', 'gone')
    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('does nothing, and does not throw, when the socket server is not up', () => {
    delete (globalThis as { __wasp_io__?: Io }).__wasp_io__
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, 'site-1')

    expect(() => failRunsForRevokedSite('site-1', 'gone')).not.toThrow()
  })
})
