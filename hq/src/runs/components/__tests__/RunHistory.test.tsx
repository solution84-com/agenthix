// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
const stopTask = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('wasp/client/operations', () => ({
  useQuery, useAction: (op: string) => (op === 'stopTask' ? stopTask : vi.fn(() => Promise.resolve())),
  getRunHistory: 'getRunHistory', getAgents: 'getAgents', getProjects: 'getProjects', stopTask: 'stopTask', stopTaskSession: 'stopTaskSession',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'Viewers cannot' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <span /> }))
// In a worktree ui's lucide icons load a second React; the search box, filters and ⋯ are the library's, tested there.
vi.mock('@agenthix/ui/primitives', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  SearchField: ({ label }: { label: string }) => <input aria-label={label} />,
  FilterSelect: ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
  ),
}))
vi.mock('@agenthix/ui/tasks', () => ({
  RunAvatar: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OverflowMenu: ({ items, label }: { items: { label: string; onSelect: () => void; disabledReason?: string }[]; label: string }) => (
    <div role="menu" aria-label={label}>{items.map(i => <button key={i.label} role="menuitem" disabled={!!i.disabledReason} title={i.disabledReason} onClick={i.onSelect}>{i.label}</button>)}</div>
  ),
}))

import { RunHistory } from '../RunHistory'
import type { RunHistoryResult, RunHistoryRow } from '../../historyTypes'

const row = (over: Partial<RunHistoryRow> = {}): RunHistoryRow => ({
  runId: 'r1', sessionId: 's1', kind: 'task', taskKey: 'WEB-14', taskId: 't14', number: 1, title: 'Fix the contact form',
  href: '/tasks/WEB-14', openable: true, place: { name: 'Website relaunch', projectKey: 'WEB' },
  agent: { id: 'a1', name: 'Writer', avatarUrl: null }, group: 'running', ring: 'RUNNING', note: null,
  tookMs: 60_000, cost: 0.01, startedBy: 'you', at: '2026-11-07T11:45:00Z', ...over,
})
const result = (over: Partial<RunHistoryResult> = {}): RunHistoryResult => ({
  rows: [row(), row({ runId: 'r2', kind: 'reply', taskKey: null, taskId: null, number: null, title: 'A reply in a conversation', href: null, openable: false, group: 'finished', ring: null })],
  counts: { all: 124, running: 3, waiting: 4, needs: 5, finished: 112 }, needs: { asks: 3, failed: 1, routines: 1 },
  total: 124, page: 1, pageSize: 20, capped: false, nothingYet: false,
  names: { task: null, agent: null, conversation: null, place: null }, taskChoices: [{ key: 'WEB-14', title: 'Fix the contact form' }], unanswered: [], ...over,
})

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.search}</output>
}

const show = (r: RunHistoryResult | undefined, at = '/projects/WEB?tool=runs', onOpenRun = vi.fn()) => {
  useQuery.mockImplementation((op: string) => (op === 'getRunHistory' ? { data: r, isLoading: !r, error: null, refetch: vi.fn() } : { data: [] }))
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes><Route path="*" element={<><RunHistory projectKey="WEB" onOpenRun={onOpenRun} onOpenTarget={vi.fn()} /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
  return { onOpenRun }
}

beforeEach(() => vi.clearAllMocks())

describe('the Runs history @RU5 @D19', () => {
  it('shows the tabs with their counts, what Needs you holds, and twenty of the total', () => {
    show(result())
    const tabs = within(screen.getByRole('group', { name: 'Show runs' }))
    expect(tabs.getByRole('button', { name: 'All 124' }).getAttribute('aria-pressed')).toBe('true')
    expect(tabs.getByRole('button', { name: 'Needs you 5' })).toBeTruthy()
    expect(screen.getByText('Needs you 5: 3 tasks · 1 failed · 1 routine')).toBeTruthy()
    expect(screen.getByText('1–20 of 124 · newest first')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Newer' })).toHaveProperty('disabled', true)
  })

  it('a tab and the pager are kept in the address, and a tab goes back to the first page', () => {
    show(result(), '/projects/WEB?tool=runs&page=2')
    fireEvent.click(screen.getByRole('button', { name: 'Running 3' }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=runs&state=running')
  })

  it('opens a run that may be opened, and not another person’s reply', () => {
    const { onOpenRun } = show(result())
    fireEvent.click(screen.getByRole('link', { name: 'Open Fix the contact form, run 1' }))
    expect(onOpenRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1' }))
    expect(screen.queryByRole('link', { name: /A reply in a conversation/ })).toBeNull()
  })

  it('offers Stop in a running row’s ⋯', async () => {
    show(result())
    const menu = within(screen.getByRole('menu', { name: 'More for Fix the contact form, run 1' }))
    fireEvent.click(menu.getByRole('menuitem', { name: 'Stop' }))
    expect(stopTask).toHaveBeenCalledWith({ taskId: 't14' })
  })

  it('says when nothing has run yet, and when nothing matches the filters, with a way to see every run', () => {
    show(result({ rows: [], total: 0, nothingYet: true, counts: { all: 0, running: 0, waiting: 0, needs: 0, finished: 0 } }))
    expect(screen.getByText('Nothing has run in this project yet. Agents start work from the Workroom.')).toBeTruthy()
  })

  it('a way in arrives with its filter showing, with ✕ to clear it', () => {
    show(result({ rows: [], total: 0, names: { task: 'WEB-12', agent: null, conversation: null, place: null } }), '/projects/WEB?tool=runs&task=WEB-12')
    expect(screen.getByText('No runs match these filters. Clear a filter, or see every run.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Task' }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=runs')
  })

  it('gives a reply the same ⋯ as a task, its Open the conversation greyed with why when it is another person’s', () => {
    show(result())
    const item = within(screen.getByRole('menu', { name: 'More for A reply in a conversation' })).getByRole('menuitem', { name: 'Open the conversation' }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('Only the person whose conversation it is can open it.')
  })

  it('a task in line is a Waiting row that says why it waits, in the Workroom’s words', () => {
    show(result({ rows: [row({ runId: 'line:t4', taskKey: 'WEB-4', title: 'Draft the case-study page', openable: false, group: 'waiting', ring: 'WAITING', note: { tone: 'muted', lead: 'Waiting', text: null }, why: { kind: 'next', after: 'Fix the contact form' }, tookMs: null, cost: null })] }))
    expect(screen.getByRole('list', { name: 'Runs' }).textContent).toContain('Waiting · next, after Fix the contact form')
  })

  it('has a Task filter on a project’s Runs, which a way in replaces with its chip', () => {
    show(result())
    fireEvent.change(screen.getByRole('combobox', { name: 'Task' }), { target: { value: 'WEB-14' } })
    expect(screen.getByTestId('where').textContent).toBe('?tool=runs&task=WEB-14')
  })

  it('offers ＋ Filter, whose filters the row does not show', () => {
    show(result())
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Whose' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'On my behalf' }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=runs&whose=behalf')
    expect(screen.getByRole('button', { name: 'Clear Whose' })).toBeTruthy()
  })
})
