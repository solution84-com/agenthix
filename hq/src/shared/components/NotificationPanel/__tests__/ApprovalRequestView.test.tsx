// @vitest-environment jsdom
/**
 * A tool request opened inside the panel (every screen reviewed spec §6): what
 * it wants to run, long scripts capped, why, and the answer.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const approve = vi.hoisted(() => vi.fn())
const reject = vi.hoisted(() => vi.fn())
const refetch = vi.hoisted(() => vi.fn())
const answers = vi.hoisted(() => ({} as Record<string, unknown>))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: answers[op], isLoading: false, refetch }),
  useAction: (op: unknown) => (op === 'approveManifest' ? approve : reject),
  getTaskByKey: 'getTaskByKey', getTaskSession: 'getTaskSession', getSessionPendingManifest: 'getSessionPendingManifest',
  getNotifications: 'getNotifications', getMyRuns: 'getMyRuns',
  approveManifest: 'approveManifest', rejectManifest: 'rejectManifest',
}))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ close: vi.fn() }) }))

import { ApprovalRequestView } from '../ApprovalRequestView'

const script = ['bash -c \'', 'set -e', 'git fetch', 'npm ci', 'npm run build', 'npx wrangler pages deploy dist', 'curl -s preview', '\''].join('\n')

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function show() {
  const onBack = vi.fn()
  render(<MemoryRouter><ApprovalRequestView taskKey="WEB-27" from="Notifications" onBack={onBack} /><Where /></MemoryRouter>)
  return onBack
}

beforeEach(() => {
  vi.clearAllMocks()
  answers.getTaskByKey = { id: 't1', title: 'Fix the checkout redirect', assignedAgent: { name: 'Frontend dev' }, project: { name: 'Agenthix' } }
  answers.getTaskSession = {
    id: 's1',
    entries: [{ id: 'e1', role: 'ASSISTANT', content: 'Fixed on the branch.' }],
    AgentRun: [
      { id: 'r1', createdAt: new Date().toISOString(), endedAt: null },
      { id: 'r2', createdAt: new Date().toISOString(), endedAt: null },
    ],
  }
  answers.getSessionPendingManifest = {
    runId: 'r2', sessionId: 's1', summary: 'I need a preview deploy to check it end to end.',
    pendingManifest: { bashPatterns: [{ pattern: 'npm run deploy:preview' }, { pattern: script }], tools: [] },
  }
})

describe('a tool request in the panel @SC-529', () => {
  it('heads the panel with the way back and the task, then its agent, place and run', () => {
    const onBack = show()
    expect(screen.getByText('Fix the checkout redirect')).toBeTruthy()
    expect(screen.getByText(/Frontend dev · Agenthix · run 2 · waiting since/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows each command, a long one capped at six lines until it is expanded', () => {
    show()
    expect(screen.getByText('npm run deploy:preview')).toBeTruthy()
    expect(screen.queryByText(/curl -s preview/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show the full script (8 lines)' }))
    expect(screen.getByText(/curl -s preview/)).toBeTruthy()
  })

  it("gives the agent's reason in its own words", () => {
    show()
    expect(screen.getByText('I need a preview deploy to check it end to end.')).toBeTruthy()
  })

  it("falls back to the run's last message when the request carries no reason", () => {
    answers.getSessionPendingManifest = { ...(answers.getSessionPendingManifest as object), summary: null }
    show()
    expect(screen.getByText('Fixed on the branch.')).toBeTruthy()
  })

  it('approves, refreshes both panels, and goes back to the list', async () => {
    const onBack = show()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
    expect(approve).toHaveBeenCalledWith({ runId: 'r2', sessionId: 's1' })
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('denies', async () => {
    const onBack = show()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
    expect(reject).toHaveBeenCalledWith({ runId: 'r2', reason: 'Denied', sessionId: 's1' })
  })

  it('says so when the request was already answered, and still leads to the task', () => {
    answers.getSessionPendingManifest = null
    show()
    expect(screen.getByText(/has been answered/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open the task ›' }))
    expect(screen.getByTestId('where').textContent).toBe('/tasks/WEB-27')
  })
})
