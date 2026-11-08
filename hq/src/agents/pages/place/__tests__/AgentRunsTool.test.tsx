// @vitest-environment jsdom
/** The agent's Runs tool: a failed run says why, in plain words (never the raw error). */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../shared/context/useShellPanels', () => ({ useShellPanels: () => ({ openRunsSession: vi.fn() }) }))

import { AgentRunsTool } from '../AgentRunsTool'
import type { RecentRun } from '../../../agentRecentRuns'

const run = (over: Partial<RecentRun>): RecentRun => ({
  id: 'r1', sessionId: 's1', status: 'COMPLETED', kind: 'task', title: 'Fix the footer', taskId: 't1', taskKey: 'WEB-1', model: 'm',
  startedAt: '2026-11-08T10:00:00Z', endedAt: null, createdAt: '2026-11-08T10:00:00Z', failure: null, ...over,
})

describe('the agent Runs tool', () => {
  it('says why a failed run failed, and nothing under a run that did not', () => {
    render(<AgentRunsTool recentRuns={{ unanswered: [], runs: [run({ id: 'a', status: 'FAILED', failure: "The agent's process stopped unexpectedly." }), run({ id: 'b' })] }} />)
    const reasons = screen.getAllByTestId('agent-run-failure')
    expect(reasons).toHaveLength(1)
    expect(reasons[0].textContent).toBe("The agent's process stopped unexpectedly.")
    expect(screen.queryByText(/exited with code/)).toBeNull()
  })
})
