// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const params = vi.hoisted(() => ({ runId: undefined as string | undefined, session: null as string | null }))

vi.mock('wasp/client/operations', () => ({ useQuery, getUserSettings: 'getUserSettings', getRunPage: 'getRunPage' }))
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ runId: params.runId }),
  useSearchParams: () => [new URLSearchParams(params.session ? `session=${params.session}` : '')],
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ title, action, children, breadcrumbs }: { title?: string; action?: React.ReactNode; children: React.ReactNode; breadcrumbs?: { label: string }[] }) => (
    <div><nav aria-label="Breadcrumb">{breadcrumbs?.map(b => b.label).join(' / ')}</nav><h1>{title}</h1>{action}{children}</div>
  ),
}))
vi.mock('../../../shared/layouts/TopBar', () => ({ BackButton: () => null, MenuButton: () => null, TopBar: () => null, TopBarTitle: () => null }))
vi.mock('../../../shared/components/RunsPanel/StopAllRunsButton', () => ({ StopAllRunsButton: () => <button>Stop all</button> }))
vi.mock('../../components/RunHistory', () => ({ RunHistory: ({ projectKey }: { projectKey?: string }) => <div>history {String(projectKey)}</div> }))
vi.mock('../../components/RunView', () => ({ RunView: ({ runId, sessionId }: { runId: string; sessionId: string | null }) => <div>run {runId} in {String(sessionId)}</div> }))

import { RunsPage, runAddress } from '../RunsPage'
import { runLabelOf } from '../../components/runLabel'
import type { RunPageView } from '../../runPageTypes'

beforeEach(() => {
  vi.clearAllMocks()
  params.runId = undefined
  params.session = null
  useQuery.mockReturnValue({ data: { role: 'MEMBER' } })
})

describe('the organisation’s Runs @D19', () => {
  it('lists the person’s own runs across projects, with Open Workrooms › as its outlined button', () => {
    render(<RunsPage />)
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeTruthy()
    expect(screen.getByText('history undefined')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Workrooms ›' })).toBeTruthy()
  })

  it('keeps the organisation-wide Stop all for an admin, and for no one else', () => {
    useQuery.mockReturnValue({ data: { role: 'ADMIN' } })
    const { unmount } = render(<RunsPage />)
    expect(screen.getByRole('button', { name: 'Stop all' })).toBeTruthy()
    unmount()
    useQuery.mockReturnValue({ data: { role: 'MEMBER' } })
    render(<RunsPage />)
    expect(screen.queryByRole('button', { name: 'Stop all' })).toBeNull()
  })

  it('opens one run on its own page, with its session from the address', () => {
    useQuery.mockReturnValue({ data: undefined })
    params.runId = 'r1'
    params.session = 's1'
    render(<RunsPage />)
    expect(screen.getByText('run r1 in s1')).toBeTruthy()
    expect(runAddress({ runId: 'r1', sessionId: 's1' })).toBe('/runs/r1?session=s1')
    expect(runAddress({ runId: 'r1', sessionId: null })).toBe('/runs/r1')
  })

  it('names an open run as the Runs design does: "WEB-12 · Run 2" at the breadcrumb’s end, not "A run"', () => {
    params.runId = 'r1'
    useQuery.mockReturnValue({ data: { kind: 'task', number: 2, detail: { ref: 'WEB-12', title: 'Check every footer link' } } })
    render(<RunsPage />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('Runs / WEB-12 · Run 2')
  })
})

describe('a run’s name where it is open', () => {
  const view = (v: Omit<Partial<RunPageView>, 'detail'> & { detail: Partial<RunPageView['detail']> }) => v as unknown as RunPageView
  it('is the key and run number in the crumb, and on a phone "Run 2" under the task’s title', () => {
    expect(runLabelOf(view({ kind: 'task', number: 2, detail: { ref: 'WEB-12', title: 'Check every footer link' } })))
      .toEqual({ crumb: 'WEB-12 · Run 2', title: 'Run 2', under: 'Check every footer link' })
  })
  it('is "A run" until the run is read, and "A reply" for a conversation’s', () => {
    expect(runLabelOf(undefined).crumb).toBe('A run')
    expect(runLabelOf(view({ kind: 'reply', number: null, detail: { ref: null, title: 'A reply in “Hosting options”' } })).crumb).toBe('A reply')
  })
})
