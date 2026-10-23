// @vitest-environment jsdom
/**
 * The Notifications panel (every screen reviewed spec §6): Needs you, then
 * Earlier; two lines and one action per item; seen once in view.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
const dismiss = vi.hoisted(() => vi.fn())
const markRead = vi.hoisted(() => vi.fn())
const approveManifest = vi.hoisted(() => vi.fn())
const getTaskByKey = vi.hoisted(() => vi.fn())
const getTaskSession = vi.hoisted(() => vi.fn())
const getSessionPendingManifest = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (op: unknown) => (op === 'dismissNotification' ? dismiss : op === 'approveManifest' ? approveManifest : markRead),
  approveManifest: 'approveManifest',
  getTaskByKey, getTaskSession, getSessionPendingManifest, getMyRuns: 'getMyRuns',
  getNotifications: 'getNotifications',
  dismissNotification: 'dismissNotification',
  markNotificationsRead: 'markNotificationsRead',
}))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ close: vi.fn() }) }))

import { NotificationPanel } from '../NotificationPanel'

const at = new Date().toISOString()
const approval = {
  id: 'n1', type: 'tool_approval', title: 'Approval needed on WEB-27', body: 'long', actionLabel: 'Review the request',
  actionUrl: '/tasks/WEB-27', status: 'unread', createdAt: at,
  task: { key: 'WEB-27', title: 'Fix the checkout redirect', agent: { name: 'Frontend dev', avatarUrl: null } },
  detail: '', command: 'npm run deploy:preview',
}
const credential = {
  id: 'n2', type: 'credential_health', title: 'Claude sign-in expired on HQ', body: 'Runs on this site stop until it is renewed',
  actionLabel: 'View execution sites', actionUrl: '/admin/where-work-runs', status: 'read', createdAt: at, task: null,
  detail: 'Runs on this site stop until it is renewed', command: null,
}
const handled = {
  id: 'n3', type: 'task_waiting', title: 'WEB-24 needs you', body: 'b', actionLabel: 'Open the task', actionUrl: '/tasks/WEB-24',
  status: 'handled', createdAt: at, task: { key: 'WEB-24', title: 'Write the launch email', agent: null },
  detail: 'reached its 30 min limit', command: null,
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function show(list: unknown[]) {
  useQuery.mockReturnValue({ data: list, refetch: vi.fn() })
  const onOpenRequest = vi.fn()
  render(<MemoryRouter><NotificationPanel onOpenRequest={onOpenRequest} /><Where /></MemoryRouter>)
  return onOpenRequest
}

let observed: { cb: IntersectionObserverCallback; targets: Element[] } | null = null
class FakeObserver {
  targets: Element[] = []
  constructor(cb: IntersectionObserverCallback) { observed = { cb, targets: this.targets } }
  observe(el: Element) { this.targets.push(el) }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks()
  observed = null
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the Notifications panel @SC-524 @SC-525 @SC-526 @SC-529', () => {
  it('lists what needs the person first, then Earlier', () => {
    show([handled, approval, credential])
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Needs you', 'Earlier'])
    const now = within(screen.getByRole('region', { name: 'Needs you' }))
    expect(now.getByText('Fix the checkout redirect')).toBeTruthy()
    expect(now.getByText('Claude sign-in expired on HQ')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Earlier' })).getByText('Write the launch email')).toBeTruthy()
  })

  it('draws a request in two lines: its key and task, then what it wants to run', () => {
    show([approval])
    expect(screen.getByText('WEB-27')).toBeTruthy()
    expect(screen.getByText('npm run deploy:preview').tagName).toBe('CODE')
    expect(screen.getByText(/Wants to run/)).toBeTruthy()
  })

  it('approves a tool request at once with its one button, and opens no view', async () => {
    getTaskByKey.mockResolvedValue({ id: 't1' })
    getTaskSession.mockResolvedValue({ id: 's1' })
    getSessionPendingManifest.mockResolvedValue({ runId: 'r1', sessionId: 's1' })
    approveManifest.mockResolvedValue(undefined)
    const onOpenRequest = show([approval])
    expect(screen.getAllByRole('button').filter(b => b.textContent === 'Approve')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Approve…' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })) })
    expect(approveManifest).toHaveBeenCalledWith({ runId: 'r1', sessionId: 's1' })
    expect(onOpenRequest).not.toHaveBeenCalled()
  })

  it('opens the request in the panel when the tile is tapped, without approving', () => {
    const onOpenRequest = show([approval])
    fireEvent.click(screen.getByText('Fix the checkout redirect'))
    expect(onOpenRequest).toHaveBeenCalledWith('WEB-27')
    expect(approveManifest).not.toHaveBeenCalled()
  })

  it('opens the request instead when nothing was left to approve', async () => {
    getTaskByKey.mockResolvedValue({ id: 't1' })
    getTaskSession.mockResolvedValue({ id: 's1' })
    getSessionPendingManifest.mockResolvedValue(null)
    const onOpenRequest = show([approval])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })) })
    expect(approveManifest).not.toHaveBeenCalled()
    expect(onOpenRequest).toHaveBeenCalledWith('WEB-27')
  })

  it('marks what is already in view seen when the panel opens, with no scrolling and no observer event', () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined)
    const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.itemId ? rect(10, 60) : rect(0, 400)
    })
    show([approval, credential])
    act(() => { vi.advanceTimersByTime(1000) })
    expect(markRead).toHaveBeenCalledWith({ ids: ['n1'] })
    vi.restoreAllMocks()
  })

  it("goes to a notice's page with its one action", () => {
    show([credential])
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }))
    expect(screen.getByTestId('where').textContent).toBe('/admin/where-work-runs')
  })

  it('dismisses an earlier item with its ✕, and offers no ✕ on one that needs the person', () => {
    show([credential, handled])
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledWith({ id: 'n3' })
  })

  it('marks what came into view seen, in one call, and only what was unread', () => {
    vi.useFakeTimers()
    show([approval, credential])
    expect(observed!.targets.map(t => (t as HTMLElement).dataset.itemId)).toEqual(['n1'])
    act(() => {
      observed!.cb([{ isIntersecting: true, target: observed!.targets[0] } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
      vi.advanceTimersByTime(1000)
    })
    expect(markRead).toHaveBeenCalledTimes(1)
    expect(markRead).toHaveBeenCalledWith({ ids: ['n1'] })
  })

  it('says so when there is nothing', () => {
    show([])
    expect(screen.getByText("You're all caught up")).toBeTruthy()
  })
})
