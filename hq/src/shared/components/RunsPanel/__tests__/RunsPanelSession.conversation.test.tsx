// @vitest-environment jsdom
/** The Runs panel's session view draws a run's conversation with the conversation's pieces, read-only (every screen reviewed). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ useQuery: vi.fn(), navigate: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ useQuery: h.useQuery, getActivitySession: 'getActivitySession' }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null, isConnected: false }) }))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ openRuns: vi.fn(), close: vi.fn() }) }))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../AgentControlsBar', () => ({ AgentControlsBar: () => null }))
vi.mock('../../MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <span>{content}</span> }))
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

import { RunsPanelSession } from '../RunsPanelSession'
import { reply, system, tool, user } from '../../ChatPanel/__tests__/conversationFixtures'

const open = (entries: unknown[], extra: Record<string, unknown> = {}) => {
  h.useQuery.mockReturnValue({
    data: {
      entries, model: 'claude-sonnet-4-6', totalInputTokens: 18_600, totalOutputTokens: 169, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
      agent: { id: 'a1', name: 'Project manager', avatarUrl: null }, task: null, AgentRun: [], conversation: { latestFailure: null }, ...extra,
    },
    isLoading: false, refetch: vi.fn(), error: null,
  })
  render(<RunsPanelSession sessionId="s1" />)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("the Runs panel's session view @SC-700", () => {
  it('names who replied and when, with the icons under the reply, and no model on the reply', () => {
    open([user('Fix it.', 24, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' })])
    expect(screen.getByText('Project manager', { selector: 'span.font-semibold' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Usage' }).length).toBe(2)
    expect(screen.queryByText('claude-sonnet-4-6')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(h.navigate).toHaveBeenCalledWith('/runs/r1?session=s1')
  })

  it('shows the work as one folded line, not one block per tool call', () => {
    open([user('Fix it.', 24, { runId: 'r1' }), tool('Read', { file_path: '/a.ts' }, 25, { runId: 'r1' }), tool('Read', { file_path: '/b.ts' }, 25, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' })])
    expect(screen.getByText(/Read 2 files/)).toBeTruthy()
  })

  it('keeps the total usage behind an icon in the header, not on a line', () => {
    open([user('Fix it.', 24, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' })])
    expect(screen.queryByText(/CO₂/)).toBeNull()
    const [header] = screen.getAllByRole('button', { name: 'Usage' })
    fireEvent.click(header)
    expect(screen.getByRole('dialog', { name: 'Usage · this session' })).toBeTruthy()
  })

  it('shows a waiting approval without the buttons, since this view only reads', () => {
    open([user('Update.', 44, { runId: 'r1' }), system('APPROVAL_REQUESTED', 45, {
      runId: 'r1',
      approvalCard: { answer: 'waiting', allowedFor: 'this_run', decidedBy: null, decidedByYou: false, decidedAt: null, reason: null, items: [{ does: 'Fetch a web page', why: null, command: false }] },
    })])
    expect(screen.getByText('Fetch a web page')).toBeTruthy()
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Deny')).toBeNull()
  })

  it('shows a failed run with its reason and no Try again, and a waiting message without Send now', () => {
    open([
      user('Summarise.', 30, { runId: 'r1' }), system('RUN_FAILED', 31, { runId: 'r1', detail: { reason: 'The site lost its connection to the model.' } }),
      user('Again?', 33, { runId: 'r2', runStatus: 'PENDING' }),
    ], { conversation: { latestFailure: { runId: 'r1' } } })
    expect(screen.queryByText('Try again')).toBeNull()
    expect(screen.getByText('Waits for the reply to finish')).toBeTruthy()
    expect(screen.queryByText('Send now')).toBeNull()
    expect(screen.queryByText('Cancel')).toBeNull()
  })
})
