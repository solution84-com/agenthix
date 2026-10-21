// @vitest-environment jsdom
/** A persistent notification in the Notifications panel (every screen reviewed spec §6): dismissed only when its kind allows. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
const dismiss = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (op: unknown) => (op === 'dismissNotification' ? dismiss : vi.fn()),
  approveManifest: 'approveManifest', getTaskByKey: vi.fn(), getTaskSession: vi.fn(), getSessionPendingManifest: vi.fn(), getMyRuns: 'getMyRuns',
  getNotifications: 'getNotifications',
  dismissNotification: 'dismissNotification',
  markNotificationsRead: 'markNotificationsRead',
}))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ close: vi.fn() }) }))

import { NotificationPanel } from '../NotificationPanel'

const at = new Date().toISOString()
const notice = (over: Record<string, unknown>) => ({
  id: 'n', type: 'site_requests', title: '3 machines are asking to connect', body: 'b', actionLabel: 'Open Execution Sites',
  actionUrl: '/org/settings/where-work-runs', status: 'read', createdAt: at, task: null, detail: 'Approve or deny them', command: null,
  dismissible: false, ...over,
})

function show(list: unknown[]) {
  useQuery.mockReturnValue({ data: list, refetch: vi.fn() })
  render(<MemoryRouter><NotificationPanel onOpenRequest={vi.fn()} /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('persistent notifications in the panel @SC-629', () => {
  it('lists an open one under Needs you with no dismiss control when its kind cannot be dismissed', () => {
    show([notice({ id: 'a' })])
    const needsYou = within(screen.getByRole('region', { name: 'Needs you' }))
    expect(needsYou.getByText('3 machines are asking to connect')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('offers dismiss under Needs you on one that may be dismissed, and dismisses it', () => {
    show([notice({ id: 'b', type: 'site_request_expired', title: "build-box-2's request expired", dismissible: true })])
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledWith({ id: 'b' })
  })

  it('offers no dismiss on a fixed one that moved to Earlier when its kind cannot be dismissed', () => {
    show([notice({ id: 'c', status: 'handled' })])
    expect(within(screen.getByRole('region', { name: 'Earlier' })).getByText('3 machines are asking to connect')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })
})
