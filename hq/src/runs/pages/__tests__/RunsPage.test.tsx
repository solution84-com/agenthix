// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const params = vi.hoisted(() => ({ runId: undefined as string | undefined, session: null as string | null }))
const mobile = vi.hoisted(() => ({ value: false }))
const newest = vi.hoisted(() => ({ runId: 'r-new' as string | null, sessionId: 's-1', href: '/tasks/P-1' }))

vi.mock('wasp/client/operations', () => ({ useQuery, getUserSettings: 'getUserSettings' }))
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ runId: params.runId }),
  useSearchParams: () => [new URLSearchParams(params.session ? `session=${params.session}` : '')],
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('../../../shared/layouts/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('../../../shared/components/RunsPanel/StopAllRunsButton', () => ({ StopAllRunsButton: () => <button>Stop all</button> }))
vi.mock('../../components/RunsList', () => ({
  RunsList: ({ onFirstPage }: { onFirstPage: (r: unknown) => void }) => {
    React.useEffect(() => { onFirstPage(newest) }, [onFirstPage])
    return <div>list</div>
  },
}))
vi.mock('../../components/RunPane', () => ({ RunPane: ({ runId, sessionId }: { runId: string; sessionId: string | null }) => <div>run {runId} in {String(sessionId)}</div> }))

import { RunsPage } from '../RunsPage'

beforeEach(() => {
  vi.clearAllMocks()
  params.runId = undefined
  params.session = null
  mobile.value = false
  useQuery.mockReturnValue({ data: { role: 'MEMBER' } })
})

describe('the Runs screen @SC-530 @SC-646', () => {
  it('offers the organisation-wide Stop all to an admin, and to no one else', () => {
    useQuery.mockReturnValue({ data: { role: 'ADMIN' } })
    const { unmount } = render(<RunsPage />)
    expect(screen.getByRole('button', { name: 'Stop all' })).toBeTruthy()
    unmount()
    useQuery.mockReturnValue({ data: { role: 'MEMBER' } })
    render(<RunsPage />)
    expect(screen.queryByRole('button', { name: 'Stop all' })).toBeNull()
    expect(screen.getByText('list')).toBeTruthy()
  })

  it('opens the newest run on arrival at a desktop, at its own address carrying its session', () => {
    render(<RunsPage />)
    expect(navigate).toHaveBeenCalledWith('/runs/r-new?session=s-1', { replace: true })
  })

  it('shows a phone the list, not a run', () => {
    mobile.value = true
    render(<RunsPage />)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not replace a run the address already names', () => {
    params.runId = 'r-old'
    params.session = 's-9'
    render(<RunsPage />)
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByText('run r-old in s-9')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Runs/ }).getAttribute('href')).toBe('/runs')
  })
})
