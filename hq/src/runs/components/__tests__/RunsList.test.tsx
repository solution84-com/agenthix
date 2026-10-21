// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react; its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { Search: icon, ChevronDown: icon, Loader2: icon }
})

const useQuery = vi.hoisted(() => vi.fn())
const getRunsPage = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery, getRunsPage, getProjects: 'getProjects', getAgents: 'getAgents',
  useAction: () => vi.fn(), approveManifest: 'approveManifest',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('react-router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWorkWhere: () => () => true }))

import { RunsList } from '../RunsList'
import type { RunListItem } from '../../screenTypes'

const item = (id: string, over: Partial<RunListItem> = {}): RunListItem => ({
  runId: id, sessionId: `s-${id}`, group: 'finished', kind: 'task', title: `Task ${id}`, ref: `P-${id}`, href: `/tasks/P-${id}`,
  place: { name: 'Project P', projectKey: 'P' }, agent: { id: 'a1', name: 'Frontend dev', handle: 'fd', avatarUrl: null },
  outcome: 'completed', riskyCalls: null, wait: null, startedByText: null, startedAt: '2026-10-09T09:06:00Z', endedAt: '2026-10-09T09:12:00Z',
  at: '2026-10-09T09:06:00Z', ...over,
})

function pages(first: { runs: RunListItem[]; nextCursor: string | null }) {
  useQuery.mockImplementation((op: unknown) =>
    op === getRunsPage ? { data: { ...first, unanswered: [] }, isLoading: false, refetch: vi.fn() } : { data: [] })
}
beforeEach(() => { vi.clearAllMocks() })

describe('the Runs screen\'s list @SC-530 @SC-647 @SC-648 @SC-649', () => {
  it('groups runs and opens the one tapped', () => {
    pages({ runs: [item('1', { group: 'running', outcome: null }), item('2')], nextCursor: null })
    const onOpen = vi.fn()
    render(<RunsList selectedRunId="2" onOpen={onOpen} />)
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Running', 'Finished'])
    fireEvent.click(screen.getByRole('button', { name: /Task 2/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ runId: '2' }))
    expect(screen.queryByText(/Older runs/)).toBeNull()
  })

  it('adds the next page under Older runs ›, and the button goes when there are none', async () => {
    pages({ runs: [item('1')], nextCursor: 'c1' })
    getRunsPage.mockResolvedValue({ runs: [item('0')], nextCursor: null, unanswered: [] })
    render(<RunsList selectedRunId={null} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Older runs ›' }))
    await waitFor(() => expect(screen.getByText('Task 0')).toBeTruthy())
    expect(getRunsPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'c1' }))
    expect(screen.queryByRole('button', { name: 'Older runs ›' })).toBeNull()
    expect(screen.getByText('Task 1')).toBeTruthy()
  })

  it('says what will show here when there are no runs, and offers a conversation', () => {
    pages({ runs: [], nextCursor: null })
    render(<RunsList selectedRunId={null} onOpen={vi.fn()} />)
    expect(screen.getByText('No runs yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start a conversation' }).getAttribute('href')).toBe('/chat')
  })

  it('says "No runs match" under filters, and clears them', () => {
    pages({ runs: [], nextCursor: null })
    render(<RunsList selectedRunId={null} onOpen={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failed' } })
    expect(screen.getByText('No runs match')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the filters' }))
    expect(screen.getByText('No runs yet')).toBeTruthy()
  })

  it('shows no total', () => {
    pages({ runs: [item('1'), item('2'), item('3')], nextCursor: null })
    render(<RunsList selectedRunId={null} onOpen={vi.fn()} />)
    expect(screen.queryByText('3')).toBeNull()
  })
})
