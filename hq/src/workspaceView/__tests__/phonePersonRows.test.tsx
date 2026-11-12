// @vitest-environment jsdom
/** The person's rows in the workspace view's phone ⋮ sheet; on a larger screen the app's rail carries them. */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const state = vi.hoisted(() => ({ role: 'MEMBER', notifications: 0, runs: 0 }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { identities: { username: { id: 'sam' } } } }), logout: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: (name: string) => ({ data: name === 'getUserSettings' ? { role: state.role } : name === 'getOrgIdentity' ? { name: 'Fernhill & Co' } : undefined }),
  getUserSettings: 'getUserSettings', getOrgIdentity: 'getOrgIdentity',
}))
vi.mock('../../shared/layouts/useShellCounts', () => ({
  useShellCounts: () => ({ unreadNotifications: state.notifications, runsInProgress: state.runs, runsNeedingYou: 0 }),
  formatCount: (n: number) => String(n),
}))

import { PhonePersonRows } from '../components/PhonePersonRows'

const Where = () => <div data-testid="where">{useLocation().search}{useLocation().pathname}</div>
const show = (ui: React.ReactNode) => render(<MemoryRouter initialEntries={['/workspaces/w1/view']}>{ui}<Where /></MemoryRouter>)
beforeEach(() => { state.role = 'MEMBER'; state.notifications = 0; state.runs = 0 })
afterEach(cleanup)

describe("the phone's ⋮ sheet rows", () => {
  it('hold the person, Runs and Notifications with its count, and Manage only for admins', () => {
    state.notifications = 6
    const done = vi.fn()
    const { unmount } = show(<PhonePersonRows rowClass="row" onDone={done} />)
    const rows = within(screen.getByTestId('phone-person-rows'))
    expect(rows.getByRole('button', { name: 'sam, account menu' })).toBeTruthy()
    expect(rows.getByRole('button', { name: /^Runs/ })).toBeTruthy()
    expect(rows.getByRole('button', { name: /^Notifications/ }).textContent).toContain('6')
    expect(rows.queryByRole('link', { name: 'Manage' })).toBeNull()
    fireEvent.click(rows.getByRole('button', { name: /^Notifications/ }))
    expect(done).toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toContain('panel=notifications')
    unmount()
    state.role = 'ADMIN'
    show(<PhonePersonRows rowClass="row" onDone={done} />)
    expect(within(screen.getByTestId('phone-person-rows')).getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe('/admin')
  })
})
