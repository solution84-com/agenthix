// @vitest-environment jsdom
/** A run whose site did not answer: said at once in place of the run, with Try again, never a dialog. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const refetch = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery, useAction: () => vi.fn(),
  getRunPage: 'getRunPage', stopTask: 'stopTask', stopTaskSession: 'stopTaskSession', runTask: 'runTask',
  approveManifest: 'approveManifest', rejectManifest: 'rejectManifest',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'Viewers cannot' }))
vi.mock('../../../shared/layouts/phoneActions', () => ({ usePhoneActions: () => false }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <span>avatar</span> }))
vi.mock('../ToolCalls', () => ({ ToolCalls: () => <div>tool calls</div> }))

import { RunView } from '../RunView'

afterEach(cleanup)

const open = () => render(<RunView runId="r2" sessionId="s1" runHref={n => `/runs/${n.runId}`} />)

describe('a run when its site does not answer @SC-1929', () => {
  it('says the site could not be asked in place of the run, as a status with Try again', () => {
    const asleep = Object.assign(new Error('The site is asleep.'), { statusCode: 503 })
    useQuery.mockReturnValue({ data: undefined, isLoading: false, error: asleep, dataUpdatedAt: 0, refetch })
    open()
    expect(screen.getByRole('status').textContent).toContain('The Execution Site could not be asked')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('says a run that is not there in its own words, with no Try again', () => {
    useQuery.mockReturnValue({ data: null, isLoading: false, error: null, dataUpdatedAt: Date.now(), refetch })
    open()
    expect(screen.getByRole('status').textContent).toContain("This run isn't available")
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
