// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const params = vi.hoisted(() => ({ runId: undefined as string | undefined, session: null as string | null }))

vi.mock('wasp/client/operations', () => ({ useQuery, getUserSettings: 'getUserSettings' }))
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ runId: params.runId }),
  useSearchParams: () => [new URLSearchParams(params.session ? `session=${params.session}` : '')],
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) => <div><h1>{title}</h1>{action}{children}</div>,
}))
vi.mock('../../../shared/layouts/TopBar', () => ({ BackButton: () => null, TopBar: () => null, TopBarTitle: () => null }))
vi.mock('../../../shared/components/RunsPanel/StopAllRunsButton', () => ({ StopAllRunsButton: () => <button>Stop all</button> }))
vi.mock('../../components/RunHistory', () => ({ RunHistory: ({ projectKey }: { projectKey?: string }) => <div>history {String(projectKey)}</div> }))
vi.mock('../../components/RunView', () => ({ RunView: ({ runId, sessionId }: { runId: string; sessionId: string | null }) => <div>run {runId} in {String(sessionId)}</div> }))

import { RunsPage, runAddress } from '../RunsPage'

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
    params.runId = 'r1'
    params.session = 's1'
    render(<RunsPage />)
    expect(screen.getByText('run r1 in s1')).toBeTruthy()
    expect(runAddress({ runId: 'r1', sessionId: 's1' })).toBe('/runs/r1?session=s1')
    expect(runAddress({ runId: 'r1', sessionId: null })).toBe('/runs/r1')
  })
})
