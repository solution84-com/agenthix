// @vitest-environment jsdom
/**
 * The Notifications and Runs panels: opened from their buttons beside the logo,
 * shown over the screen against the navigation, closed back to the same screen.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('lucide-react', async (importOriginal) => ({ ...(await importOriginal<typeof import('lucide-react')>()), Bell: () => null, Activity: () => null }))
const counts = { unreadNotifications: 0, runsInProgress: 0, tasksNeedingYou: 0 }
vi.mock('../useShellCounts', () => ({
  useShellCounts: () => counts,
  formatCount: (n: number) => (n > 99 ? '99+' : String(n)),
}))
const mobile = { value: false }
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('../../components/NotificationPanel/NotificationPanel', () => ({
  NotificationPanel: ({ onOpenRequest }: { onOpenRequest: (key: string) => void }) => (
    <p>notification list<button onClick={() => onOpenRequest('WEB-27')}>approve it</button></p>
  ),
}))
vi.mock('../../components/RunsPanel/RunsPanelList', () => ({
  RunsPanelList: ({ onOpenRequest }: { onOpenRequest: (key: string) => void }) => (
    <p>runs list<button onClick={() => onOpenRequest('WEB-31')}>approve run</button></p>
  ),
}))
vi.mock('../../components/NotificationPanel/ApprovalRequestView', () => ({
  ApprovalRequestView: ({ taskKey, from, onBack }: { taskKey: string; from: string; onBack: () => void }) => (
    <p>request {taskKey} from {from}<button onClick={onBack}>back</button></p>
  ),
}))
vi.mock('../../components/RunsPanel/RunsPanelSession', () => ({
  RunsPanelSession: ({ sessionId }: { sessionId: string }) => <p>run {sessionId}</p>,
}))

import { ShellPanelButtons } from '../ShellPanelButtons'
import { ShellPanelHost } from '../ShellPanelHost'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderShell(entry = '/projects/AGX/tasks') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ShellPanelButtons />
      <ShellPanelHost />
      <Where />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mobile.value = false
  counts.unreadNotifications = 0
  counts.runsInProgress = 0
})

describe('Notifications and Runs panels @SC-014 @SC-154 @SC-155 @SC-221 @SC-526 @SC-529', () => {
  it('opens Notifications from its button, and closes back to the same screen', () => {
    renderShell()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' }).textContent).toContain('notification list')
    expect(screen.getByTestId('where').textContent).toBe('/projects/AGX/tasks?panel=notifications')

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where').textContent).toBe('/projects/AGX/tasks')
  })

  it('switches from one panel to the other', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    expect(screen.getByRole('dialog', { name: 'Runs' }).textContent).toContain('runs list')
    expect(screen.queryByText('notification list')).toBeNull()
  })

  it('closes when the person clicks outside it or presses Escape', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    fireEvent.click(screen.getByTestId('shell-panel-dismiss'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the ?runs= deep link: it opens that run in the Runs panel', () => {
    renderShell('/tasks/AGX-1?runs=s1')
    expect(screen.getByRole('dialog', { name: 'Runs' }).textContent).toBe('run s1')
    expect(screen.getByRole('button', { name: 'Runs' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('lies beside the navigation on a wide screen and fills the screen on a small one', () => {
    const { unmount } = renderShell('/?panel=runs')
    expect(screen.getByTestId('shell-panel').className).toContain('absolute')
    unmount()
    mobile.value = true
    renderShell('/?panel=runs')
    expect(screen.getByTestId('shell-panel').className).toContain('fixed inset-0')
    expect(screen.queryByTestId('shell-panel-dismiss')).toBeNull()
  })

  it('opens a tool request inside the panel it came from, and goes back to the list', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    fireEvent.click(screen.getByRole('button', { name: 'approve it' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' }).textContent).toContain('request WEB-27 from Notifications')
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' }).textContent).toContain('notification list')

    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    fireEvent.click(screen.getByRole('button', { name: 'approve run' }))
    expect(screen.getByRole('dialog', { name: 'Runs' }).textContent).toContain('request WEB-31 from Runs')
  })

  it('drops an open request when the person switches panels', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    fireEvent.click(screen.getByRole('button', { name: 'approve it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' }).textContent).toContain('notification list')
  })

  it('shows how many need you and how many are running on the buttons', () => {
    counts.unreadNotifications = 3
    counts.runsInProgress = 120
    renderShell()
    expect(screen.getByTestId('notifications-count').textContent).toBe('3')
    expect(screen.getByTestId('runs-count').textContent).toBe('99+')
    expect(screen.getByRole('button', { name: 'Notifications, 3 need you' })).toBeTruthy()
  })

  it('shows no count when there is nothing to count', () => {
    renderShell()
    expect(screen.queryByTestId('notifications-count')).toBeNull()
    expect(screen.queryByTestId('runs-count')).toBeNull()
  })
})
