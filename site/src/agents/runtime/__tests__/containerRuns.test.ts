/**
 * adr-0083: nothing is reset when a turn ends. A storage boundary's container
 * is left as it is when its last run ends — what a conversation started ends
 * with that conversation (conversationLifecycle.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../containerDestroyed', () => ({ notifyContainerDestroyed: vi.fn() }))
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn(), connectionState: () => 'connected' },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() })),
}))

import { ContainerRuns } from '../containerRuns'
import { credentialHomeRunCount, enterCredentialHome, leaveCredentialHome } from '../agentCredentials'
import type { ContainerState } from '../containerTypes'

const NAME = 'agenthix-agent-container'

function setup() {
  const states = new Map<string, ContainerState>()
  return { runs: new ContainerRuns(states), states }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the end of a run', () => {
  it('leaves a boundary container as it is when its last run ends', () => {
    const { runs, states } = setup()
    runs.markRunStart(NAME)

    runs.markRunEnd(NAME)

    expect(states.get(NAME)?.activeRuns).toBe(0)
  })

  it('does not bring back the record of a container that is gone', () => {
    const { runs, states } = setup()

    runs.markRunEnd(NAME)

    expect(states.has(NAME)).toBe(false)
  })

  it('counts the runs using a home, and forgets a home nobody uses', () => {
    const other = '/site/homes/other'
    enterCredentialHome(other)
    enterCredentialHome(other)
    expect(credentialHomeRunCount(other)).toBe(2)
    expect(leaveCredentialHome(other)).toBe(false)
    expect(leaveCredentialHome(other)).toBe(true)
    expect(credentialHomeRunCount(other)).toBe(0)
    // A stray extra leave does not drive the count below zero.
    expect(leaveCredentialHome(other)).toBe(true)
    expect(credentialHomeRunCount(other)).toBe(0)
  })
})
