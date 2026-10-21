import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'

const listeners = vi.hoisted(() => new Map<string, (e: RunStatusEvent, siteId: string) => Promise<void>>())
vi.mock('../channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: RunStatusEvent, siteId: string) => Promise<void>) => listeners.set(name, l),
}))
const mockOwnedBy = vi.hoisted(() => vi.fn())
vi.mock('../channel/sessionOwnerSite', () => ({ sessionOwnedBy: mockOwnedBy }))

import { registerActiveRunTracker } from '../activeRunTracker'
import { failRunsForRevokedSite, __resetActiveRunsForTests } from '../activeRuns'

const emit = vi.fn()
const to = vi.fn(() => ({ emit }))

function frame(status: RunStatusEvent['status']): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'a', agentHandle: 'a', status,
    error: null, sessionPatch: null, manifestPending: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetActiveRunsForTests()
  listeners.clear()
  registerActiveRunTracker()
  ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = { to }
})
afterEach(() => {
  delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__
})

describe('the active-run tracker — R-058', () => {
  it('tracks a run that starts on the site that owns its session', async () => {
    mockOwnedBy.mockResolvedValue(true)
    await listeners.get('active-run-tracker')!(frame('RUNNING'), 'site-1')

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'FAILED', error: 'gone' })
  })

  it("ignores a frame from a site that does not own the session, so it cannot get another's session announced", async () => {
    mockOwnedBy.mockResolvedValue(false)
    await listeners.get('active-run-tracker')!(frame('RUNNING'), 'site-evil')

    failRunsForRevokedSite('site-evil', 'gone')

    expect(emit).not.toHaveBeenCalled()
  })

  it('a terminal frame from the owner closes the run', async () => {
    mockOwnedBy.mockResolvedValue(true)
    const listener = listeners.get('active-run-tracker')!
    await listener(frame('RUNNING'), 'site-1')
    await listener(frame('COMPLETED'), 'site-1')

    failRunsForRevokedSite('site-1', 'gone')

    expect(emit).not.toHaveBeenCalled()
  })
})
