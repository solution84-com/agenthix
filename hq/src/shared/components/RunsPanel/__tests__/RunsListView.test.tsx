// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const stopTaskSession = vi.hoisted(() => vi.fn())
const stopTask = vi.hoisted(() => vi.fn())
const approveManifest = vi.hoisted(() => vi.fn())
const getTaskByKey = vi.hoisted(() => vi.fn())
const getTaskSession = vi.hoisted(() => vi.fn())
const getSessionPendingManifest = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (op: unknown) => (op === 'stopTask' ? stopTask : op === 'approveManifest' ? approveManifest : stopTaskSession),
  approveManifest: 'approveManifest', getTaskByKey, getTaskSession, getSessionPendingManifest, getNotifications: 'getNotifications',
  getMyRuns: 'getMyRuns',
  stopTaskSession: 'stopTaskSession',
  stopTask: 'stopTask',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: '' }))

import { RunsListView } from '../RunsListView'
import { groupRuns } from '../runsListLogic'
import { run } from './runFixtures'

const mine = run('mine', { startedAt: new Date(Date.now() - 12 * 60_000).toISOString() })
const forMe = run('formine', { startedByMe: false, startedBy: { kind: 'automation', name: null }, startedByText: 'started by automation' })
const queued = run('queued', {
  group: 'queued', sessionId: null, startedByMe: false, startedBy: { kind: 'automation', name: null },
  wait: { kind: 'line', position: 3, agentName: 'Bot', agentBusy: true },
})
const finished = run('done', { group: 'finished', state: 'failed — reached its 30 min limit', href: '/tasks/P-9' })
const waiting = run('wait', { group: 'waiting', state: 'wants approval', wantsApproval: true, ref: 'P-27', href: '/tasks/P-27' })
const conversation = run('talk', {
  kind: 'conversation', ref: null, task: null, title: 'Homepage headline ideas', href: '/projects/P/c/talk',
  place: { name: 'Project P', projectKey: 'P' },
})

function show(runs: unknown[], projectKey?: string) {
  useQuery.mockReturnValue({ data: runs, isLoading: false, refetch: vi.fn() })
  const onOpen = vi.fn()
  const onOpenRequest = vi.fn()
  render(<RunsListView onOpen={onOpen} onOpenRequest={onOpenRequest} projectKey={projectKey} />)
  return { onOpen, onOpenRequest }
}

beforeEach(() => vi.clearAllMocks())

describe('the runs list @SC-524 @SC-529 @SC-530', () => {
  it("groups runs as a Workroom does: Needs you, Running, Waiting and Finished today, in that order", () => {
    show([finished, queued, mine, waiting])
    const names = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))
    expect(names).toEqual(['Needs you', 'Running', 'Waiting', 'Finished today'])
  })

  it("rings each run's agent with its state, in place of a state chip (D18)", () => {
    show([waiting, mine, queued, finished])
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByRole('img').getAttribute('data-run')).toBe('NEEDS_YOU')
    expect(within(screen.getByRole('region', { name: 'Running' })).getByRole('img').getAttribute('data-run')).toBe('RUNNING')
    expect(within(screen.getByRole('region', { name: 'Waiting' })).getByRole('img').getAttribute('data-run')).toBe('WAITING')
    // The finished run here failed: every failed run is ringed Failed.
    expect(within(screen.getByRole('region', { name: 'Finished today' })).getByRole('img').getAttribute('data-run')).toBe('FAILED')
  })

  it('leaves out a run that finished before today: the history is on Runs', () => {
    show([run('yesterday', { group: 'finished', endedAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' })])
    expect(screen.queryByText('Task yesterday')).toBeNull()
  })

  it('draws each run in two lines: its key and title, then agent, place and state', () => {
    show([waiting, queued, finished])
    expect(screen.getByText('P-27')).toBeTruthy()
    expect(screen.getByText('Task wait')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByText('wants approval')).toBeTruthy()
    expect(screen.getByText('3rd in line for Bot')).toBeTruthy()
    expect(screen.getByText('failed — reached its 30 min limit')).toBeTruthy()
  })

  it('names who started a run only when it was not the viewer', () => {
    show([mine, forMe])
    expect(screen.getByText(/started by automation/)).toBeTruthy()
    expect(screen.queryByText(/started by you/)).toBeNull()
  })

  it('says how long a run has been going', () => {
    show([mine])
    expect(screen.getByText('12 min')).toBeTruthy()
  })

  it('marks a conversation in a project as one', () => {
    show([conversation])
    expect(screen.getByText('Homepage headline ideas')).toBeTruthy()
    expect(screen.getByText(/Project P · conversation/)).toBeTruthy()
  })

  it('narrows to the runs the person started, or those done on their behalf', () => {
    show([mine, forMe])
    fireEvent.click(screen.getByRole('button', { name: 'Started by me' }))
    expect(screen.getByText('Task mine')).toBeTruthy()
    expect(screen.queryByText('Task formine')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'On my behalf' }))
    expect(screen.getByText('Task formine')).toBeTruthy()
  })

  it('gives a request for an okay its one answer, Review, which opens the request; a tap on the run does too', () => {
    const { onOpenRequest } = show([waiting])
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onOpenRequest).toHaveBeenCalledWith('P-27')
    expect(approveManifest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Task wait'))
    expect(onOpenRequest).toHaveBeenCalledTimes(2)
  })

  it('gives a question its one answer, Answer, which opens the run', () => {
    const asked = run('asked', { group: 'waiting', state: 'Photos or drawings?' })
    const { onOpen } = show([asked])
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    expect(onOpen).toHaveBeenCalledWith(asked)
  })

  it('shows a stored reason in plain words', () => {
    show([run('denied', { group: 'waiting', state: 'manifest rejected — awaiting human review' })])
    expect(screen.getByText('Request denied — run again to retry')).toBeTruthy()
  })

  it('offers nothing on a run that is running or waiting: they are stopped from a Workroom', () => {
    show([mine, queued])
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(stopTaskSession).not.toHaveBeenCalled()
    expect(stopTask).not.toHaveBeenCalled()
  })

  it('opens a run when its row is clicked', () => {
    const { onOpen } = show([finished])
    fireEvent.click(screen.getByText('Task done'))
    expect(onOpen).toHaveBeenCalledWith(finished)
  })

  it("shows only a place's runs when given its project key", () => {
    const elsewhere = run('elsewhere', { title: 'Other task', place: { name: 'Project Q', projectKey: 'Q' } })
    show([mine, elsewhere], 'P')
    expect(screen.getByText('Task mine')).toBeTruthy()
    expect(screen.queryByText('Other task')).toBeNull()
  })

  it('says what would show here when there are no runs', () => {
    show([])
    expect(screen.getByText(/Nothing is running for you/)).toBeTruthy()
  })
})

describe('groupRuns @SC-530', () => {
  it('lists the newest finished run first', () => {
    const older = run('old', { group: 'finished', updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = run('new', { group: 'finished', updatedAt: '2026-02-01T00:00:00.000Z' })
    expect(groupRuns([older, newer], 'all').finished.map(r => r.key)).toEqual(['new', 'old'])
  })

  it("keeps only today's finished runs when given the start of today", () => {
    const older = run('old', { group: 'finished', endedAt: '2026-01-01T09:00:00.000Z' })
    const newer = run('new', { group: 'finished', endedAt: '2026-01-02T09:00:00.000Z' })
    expect(groupRuns([older, newer], 'all', '2026-01-02T00:00:00.000Z').finished.map(r => r.key)).toEqual(['new'])
  })
})
