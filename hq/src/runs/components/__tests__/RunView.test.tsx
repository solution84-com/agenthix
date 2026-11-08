// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const stop = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('wasp/client/operations', () => ({
  useQuery, useAction: (op: string) => (op === 'stopTask' ? stop : vi.fn(() => Promise.resolve())),
  getRunPage: 'getRunPage', stopTask: 'stopTask', stopTaskSession: 'stopTaskSession', runTask: 'runTask',
  approveManifest: 'approveManifest', rejectManifest: 'rejectManifest',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'Viewers cannot' }))
vi.mock('../../../shared/layouts/phoneActions', () => ({ usePhoneActions: () => false }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <span>avatar</span> }))
vi.mock('../ToolCalls', () => ({ ToolCalls: () => <div>tool calls</div> }))

import { RunView, requestText } from '../RunView'
import type { RunPageView } from '../../runPageTypes'

const view = (over: Partial<RunPageView> = {}, detail: Partial<RunPageView['detail']> = {}): RunPageView => ({
  detail: {
    runId: 'r2', sessionId: 's1', status: 'RUNNING', group: 'running', outcome: null, error: null, kind: 'task',
    title: 'Check every footer link', ref: 'WEB-12', href: '/tasks/WEB-12', place: { name: 'Website relaunch', projectKey: 'WEB' },
    agent: { id: 'a1', name: 'Writer', handle: 'writer', avatarUrl: null }, startedByLine: null, runtime: null,
    model: 'deepseek-v4.1-flash', usage: { inputTokens: 15000, outputTokens: 3000, totalTokens: 18000 }, site: 'fernhill-hq',
    startedAt: '2026-11-07T11:45:00Z', endedAt: null, createdAt: '2026-11-07T11:45:00Z', request: null, approvalGiven: null, riskyCalls: null,
    ...detail,
  },
  kind: 'task', number: 2, taskId: 't12', group: 'running', ring: 'RUNNING', note: null, startedBy: 'you', onBehalfOf: 'you',
  limits: { timeLimitMinutes: 60, turnLimit: 50 }, tookMs: 60_000, cost: 0.02, tokens: 18000,
  previous: { runId: 'r1', sessionId: 's1', number: 1, status: 'COMPLETED', endedAt: '2026-11-07T07:55:00Z', at: '2026-11-07T07:50:00Z' },
  next: null, mayRunAgain: false, modelNote: null,
  ...over,
})

const show = (v: RunPageView | null) => {
  useQuery.mockReturnValue({ data: v, isLoading: false, error: null, refetch: vi.fn() })
  return render(<RunView runId="r2" sessionId="s1" runHref={n => `/runs/${n.runId}?session=${n.sessionId}`} />)
}

beforeEach(() => vi.clearAllMocks())

describe('a run’s own page @RN1', () => {
  it('names the task’s run by its number, shows it running with Stop, and opens the run before it', () => {
    show(view())
    expect(screen.getByRole('heading', { name: 'Check every footer link · Run 2' })).toBeTruthy()
    expect(screen.getByText('Running · 1 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stop).toHaveBeenCalledWith({ taskId: 't12' })
    fireEvent.click(screen.getByRole('button', { name: /Run 1 · finished/ }))
    expect(navigate).toHaveBeenCalledWith('/runs/r1?session=s1')
    expect(screen.getByText(/To change course, stop it, or talk to Writer/)).toBeTruthy()
  })

  it('says what it runs on and costs: kind, who started it and for whom, model, site, time against its limit, turns, tokens', () => {
    show(view())
    const facts = within(screen.getByRole('region', { name: 'This run' }))
    expect(facts.getByText(/a task’s run/)).toBeTruthy()
    expect(facts.getByText('deepseek-v4.1-flash')).toBeTruthy()
    expect(facts.getByText('fernhill-hq')).toBeTruthy()
    expect(facts.getByText('1 min of 60 min')).toBeTruthy()
    expect(facts.getByText('up to 50')).toBeTruthy()
    expect(facts.getByText('18k · about $0.02')).toBeTruthy()
  })

  it("says when a conversation's work ran on another model than the conversation's, and why", () => {
    const line = 'Ran on DeepSeek V4.1 Flash · via OpenRouter: Claude Opus 5 · via Anthropic is not allowed for this work.'
    show(view({ kind: 'reply', number: null, taskId: null, modelNote: line }, { kind: 'conversation', ref: null }))
    expect(within(screen.getByRole('region', { name: 'This run' })).getByText(line)).toBeTruthy()
  })

  it('a failed latest run says why and offers Run again; a stopped one says who stopped it', () => {
    const { unmount } = show(view({ group: 'needs', ring: 'FAILED', note: { tone: 'danger', lead: 'Failed', text: 'the build command failed' }, mayRunAgain: true }, { status: 'FAILED', endedAt: '2026-11-07T11:49:00Z' }))
    // The chip says Failed; the reason is its own line under it, so a long one wraps inside the screen.
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('the build command failed').className).toContain('basis-full')
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    unmount()
    show(view({ group: 'finished', ring: null, note: { tone: 'muted', lead: null, text: 'Stopped by Sam Okafor' } }, { status: 'CANCELLED', endedAt: '2026-11-07T11:46:00Z' }))
    expect(screen.getByText('Stopped by Sam Okafor')).toBeTruthy()
    expect(screen.queryByText(/Did not finish/)).toBeNull()
  })

  it('a run that is not there, or not the person’s to see, reads the same', () => {
    show(null)
    expect(screen.getByText("This run isn't available")).toBeTruthy()
  })

  it('words a request and its answer', () => {
    const base = { status: 'PENDING_APPROVAL' as const, tools: ['bash'], bashPatterns: [], summary: null, answeredAt: null, decidedBy: null, current: true }
    expect(requestText(base)).toBe('Asked for bash — waiting for you')
    expect(requestText({ ...base, status: 'REJECTED', decidedBy: 'Ana', answeredAt: '2026-11-07T10:00:00Z' })).toMatch(/denied by Ana at/)
  })
})
