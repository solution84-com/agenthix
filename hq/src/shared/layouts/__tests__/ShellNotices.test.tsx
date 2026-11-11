// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ useQuery: ops.useQuery, getHqReadOnly: 'getHqReadOnly', getScheduledChangeNotices: 'getScheduledChangeNotices' }))

import { ShellNotices } from '../ShellNotices'

const SITE_NOTICE = {
  key: 'c1:2026-10-18T02:00:00.000Z', kind: 'upgrade', siteName: 'office-server', at: new Date('2026-10-18T02:00:00Z'), expectedMinutes: 20,
  detail: null, told: new Date('2026-10-13T09:00:00Z'), moved: null, projectKeys: ['RAF'],
}
const HQ_NOTICE = { ...SITE_NOTICE, key: 'c2:x', siteName: null, projectKeys: [] }

function given(notices: unknown[], readOnly: unknown = { readOnly: false }) {
  ops.useQuery.mockImplementation((fn: string) => ({ data: fn === 'getHqReadOnly' ? readOnly : notices }))
}
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><ShellNotices /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ShellNotices — scheduled changes, as members see them @SC-931', () => {
  it('shows a change on the page of a project that runs where it is, with when they were told', () => {
    given([SITE_NOTICE])
    at('/projects/RAF')
    expect(screen.getByText(/Scheduled maintenance will pause runs on .* for about 20 minutes/)).toBeTruthy()
    expect(screen.getByText(/office-server, where this project runs, is being upgraded\./)).toBeTruthy()
    expect(screen.getByText(/Told on 13 Oct/)).toBeTruthy()
  })

  it('shows nothing on a project that runs elsewhere, or on another screen', () => {
    given([SITE_NOTICE])
    at('/projects/OTHER')
    expect(screen.queryByText(/scheduled maintenance/i)).toBeNull()
    cleanup()
    at('/org')
    expect(screen.queryByText(/scheduled maintenance/i)).toBeNull()
  })

  it('tells everyone on Home when the change is to hq itself, and not on a project', () => {
    given([HQ_NOTICE])
    at('/')
    expect(screen.getByText(/Scheduled maintenance: HQ will be unavailable on/)).toBeTruthy()
    cleanup()
    at('/projects/RAF')
    expect(screen.queryByText(/HQ will be unavailable/)).toBeNull()
  })

  it('puts a notice away on Dismiss, and keeps it away', () => {
    given([SITE_NOTICE])
    at('/projects/RAF')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/scheduled maintenance/i)).toBeNull()
    cleanup()
    at('/projects/RAF')
    expect(screen.queryByText(/scheduled maintenance/i)).toBeNull()
  })

  it('a new time is a notice that was not put away', () => {
    given([SITE_NOTICE])
    at('/projects/RAF')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    cleanup()
    given([{ ...SITE_NOTICE, key: 'c1:2026-10-19T02:00:00.000Z', at: new Date('2026-10-19T02:00:00Z'), moved: new Date('2026-10-15T15:10:00Z') }])
    at('/projects/RAF')
    expect(screen.getByText(/Moved: maintenance is now/)).toBeTruthy()
  })
})

describe('ShellNotices — hq read-only while it moves @SC-934', () => {
  it('says so once, in the attention dialog, with no way to act but Close @SC-1910', () => {
    given([], { readOnly: true, to: 'new-box', since: '2026-10-15T14:02:00Z' })
    at('/org')
    expect(screen.getByText('HQ is read-only while it moves to a new machine')).toBeTruthy()
    expect(screen.getByText(/You can read everything, but changes you make now would not be kept\./)).toBeTruthy()
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Close'])
  })

  it('shows nothing when hq is writable and nothing is scheduled', () => {
    given([])
    const { container } = at('/')
    expect(container.textContent).toBe('')
  })
})
