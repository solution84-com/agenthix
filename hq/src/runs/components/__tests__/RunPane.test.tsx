// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery, useAction: () => vi.fn(), getRunDetail: 'getRunDetail',
  stopTaskSession: 'stopTaskSession', approveManifest: 'approveManifest', rejectManifest: 'rejectManifest',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('react-router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWorkWhere: () => () => true }))
vi.mock('../ToolCalls', () => ({ ToolCalls: () => <div>tool calls</div> }))

import { RunPane, requestText } from '../RunPane'
import type { RunDetail } from '../../screenTypes'

const detail = (over: Partial<RunDetail> = {}): RunDetail => ({
  runId: 'r1', sessionId: 's1', status: 'COMPLETED', group: 'finished', outcome: 'completed', error: null, kind: 'task',
  title: 'Update the footer links', ref: 'WEB-24', href: '/tasks/WEB-24', place: { name: 'Website Redesign', projectKey: 'WEB' },
  agent: { id: 'a1', name: 'Frontend dev', handle: 'fd', avatarUrl: null }, startedByLine: 'by automation, for you', runtime: 'Claude Code',
  model: 'claude-sonnet-5', usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 }, site: 'HQ',
  startedAt: '2026-10-09T09:06:00Z', endedAt: '2026-10-09T09:12:00Z', createdAt: '2026-10-09T09:06:00Z', request: null, approvalGiven: null, riskyCalls: null, ...over,
})
beforeEach(() => vi.clearAllMocks())

describe('one run opened @SC-530 @SC-646 @SC-650', () => {
  it('shows what it was for, who started it, the runtime and model together, the site, and a way to the task', () => {
    useQuery.mockReturnValue({ data: detail(), isLoading: false })
    render(<RunPane runId="r1" sessionId="s1" />)
    expect(screen.getByText('Update the footer links')).toBeTruthy()
    expect(screen.getByText('by automation, for you')).toBeTruthy()
    expect(screen.getByText('Claude Code · claude-sonnet-5')).toBeTruthy()
    expect(screen.getByText('HQ')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the task' }).getAttribute('href')).toBe('/tasks/WEB-24')
    expect(screen.queryByRole('button', { name: /Run again/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('offers Stop while it is going, and Approve and Deny while its request can be answered', () => {
    useQuery.mockReturnValue({ data: detail({ status: 'RUNNING', group: 'running', outcome: null }), isLoading: false })
    const { unmount } = render(<RunPane runId="r1" sessionId="s1" />)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    unmount()

    useQuery.mockReturnValue({
      data: detail({ group: 'waiting', outcome: 'wants approval', request: { status: 'PENDING_APPROVAL', tools: [], bashPatterns: ['git push'], summary: null, answeredAt: null, decidedBy: null, current: true } }),
      isLoading: false,
    })
    render(<RunPane runId="r1" sessionId="s1" />)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy()
    expect(screen.getByText('Asked for the command git push — waiting for you')).toBeTruthy()
  })

  it('reads "This run isn\'t available" for a run it was not given, or that the server would not show', () => {
    useQuery.mockReturnValue({ data: null, isLoading: false })
    const { unmount } = render(<RunPane runId="r1" sessionId="s1" />)
    expect(screen.getByText("This run isn't available")).toBeTruthy()
    unmount()
    render(<RunPane runId="r1" sessionId={null} />)
    expect(screen.getByText("This run isn't available")).toBeTruthy()
  })
})

describe('what a run asked for @SC-530 @SC-651', () => {
  const base = { tools: ['bash'], bashPatterns: [], summary: null, answeredAt: '2026-10-09T09:10:00Z', decidedBy: 'Ana', current: false }
  it('says how the request was answered, and that a replaced one was replaced', () => {
    expect(requestText({ ...base, status: 'APPROVED' })).toMatch(/^Asked for bash — approved by Ana at \d\d:\d\d, for the next run$/)
    expect(requestText({ ...base, status: 'REJECTED' })).toMatch(/denied by Ana at/)
    // Decided before who was recorded: the time only.
    expect(requestText({ ...base, decidedBy: null, status: 'APPROVED' })).toMatch(/^Asked for bash — approved at \d\d:\d\d/)
    expect(requestText({ ...base, status: 'SUPERSEDED' })).toBe('Asked for bash — replaced by something newer')
    expect(requestText({ ...base, status: 'PENDING_APPROVAL' })).toBe('Asked for bash — replaced by something newer')
  })
})
