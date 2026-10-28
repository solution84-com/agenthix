// @vitest-environment jsdom
/**
 * The Runs panel's session view handled only not-found, so a
 * session whose site could not be asked (503) read as an empty run.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
// A used skill's line is hq's to give (useSessionSkillLines.test.ts); none here.
vi.mock('../../ChatPanel/useSessionSkillLines', () => ({ useSessionSkillLines: () => () => null }))
vi.mock('wasp/client/operations', () => ({ useQuery, getActivitySession: 'getActivitySession' }))
vi.mock('wasp/client/webSocket', () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
  useSocketListener: vi.fn(),
}))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ openRuns: vi.fn(), close: vi.fn() }) }))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../AgentControlsBar', () => ({ AgentControlsBar: () => null }))

import { RunsPanelSession } from '../RunsPanelSession'

const withStatus = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })

beforeEach(() => vi.clearAllMocks())

describe("the Runs panel's session view when the read fails @SC-156 @SC-418", () => {
  it('says the site could not be asked, not that the run is empty', () => {
    useQuery.mockReturnValue({
      data: undefined, isLoading: false, refetch: vi.fn(),
      error: withStatus(503, 'Execution Site "Laptop" is unreachable — its runs and workspaces are unavailable until it reconnects'),
    })
    render(<RunsPanelSession sessionId="s1" />)

    expect(screen.getByRole('status').textContent).toContain('could not be asked')
    expect(screen.getByRole('status').textContent).toContain('Laptop')
    expect(screen.queryByText('Nothing in this run yet')).toBeNull()
  })

  it('shows a session that is gone as not found', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn(), error: withStatus(404, 'Session not found') })
    render(<RunsPanelSession sessionId="s1" />)

    expect(screen.getByText('Session not found')).toBeTruthy()
    expect(screen.queryByText('Nothing in this run yet')).toBeNull()
  })

  it('shows any other failure as a failure', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn(), error: withStatus(500, 'Internal error') })
    render(<RunsPanelSession sessionId="s1" />)

    expect(screen.getByRole('alert').textContent).toContain('Could not load this session')
    expect(screen.queryByText('Nothing in this run yet')).toBeNull()
  })

  it('still says Nothing in this run yet for a session the site answered for with nothing in it', () => {
    useQuery.mockReturnValue({ data: { entries: [], agent: { name: 'Bot' } }, isLoading: false, refetch: vi.fn(), error: null })
    render(<RunsPanelSession sessionId="s1" />)

    expect(screen.getByText('Nothing in this run yet')).toBeTruthy()
  })
})
