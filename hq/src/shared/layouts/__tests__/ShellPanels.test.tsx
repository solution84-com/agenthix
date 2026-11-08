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
const counts = vi.hoisted(() => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }))
vi.mock('../useShellCounts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../useShellCounts')>()), useShellCounts: () => counts }))
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

import { ShellPanelButtons, ShellPanelRows } from '../ShellPanelButtons'
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
  counts.runsNeedingYou = 0
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

  it('shows how many need the person on the buttons; Runs says what is running in its name and tooltip', () => {
    counts.unreadNotifications = 3
    counts.runsNeedingYou = 120
    counts.runsInProgress = 3
    renderShell()
    expect(screen.getByTestId('notifications-count').textContent).toBe('3')
    expect(screen.getByTestId('runs-count').textContent).toBe('99+')
    expect(screen.getByRole('button', { name: 'Notifications, 3 need you' })).toBeTruthy()
    const runs = screen.getByRole('button', { name: 'Runs, 99+ need you, 3 running' })
    fireEvent.mouseEnter(runs)
    expect(screen.getByTestId('tooltip').textContent).toBe('Runs · 3 running')
  })

  it('gives Runs no badge for what is only running', () => {
    counts.runsInProgress = 4
    renderShell()
    expect(screen.queryByTestId('runs-count')).toBeNull()
    expect(screen.getByRole('button', { name: 'Runs, 4 running' })).toBeTruthy()
  })

  it('highlights Runs on the Runs page, which is not one of the places', () => {
    renderShell('/runs/r1')
    expect(screen.getByRole('button', { name: 'Runs' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows no count when there is nothing to count', () => {
    renderShell()
    expect(screen.queryByTestId('notifications-count')).toBeNull()
    expect(screen.queryByTestId('runs-count')).toBeNull()
  })
})

describe('Notifications and Runs in the phone drawer’s foot', () => {
  function renderRows(onOpen = vi.fn()) {
    return render(
      <MemoryRouter initialEntries={['/projects']}>
        <ShellPanelRows onOpen={onOpen} />
        <Where />
      </MemoryRouter>,
    )
  }

  it('says their counts in words: “3 need you”, “2 need you · 3 running”', () => {
    counts.unreadNotifications = 3
    counts.runsNeedingYou = 2
    counts.runsInProgress = 3
    renderRows()
    expect(screen.getByRole('button', { name: /^Notifications/ }).textContent).toBe('Notifications3 need you')
    expect(screen.getByRole('button', { name: /^Runs/ }).textContent).toBe('Runs2 need you · 3 running')
  })

  it('says nothing beside a row with nothing to count', () => {
    renderRows()
    expect(screen.getByRole('button', { name: /^Runs/ }).textContent).toBe('Runs')
  })

  it('closes the drawer and opens the panel', () => {
    const onOpen = vi.fn()
    renderRows(onOpen)
    fireEvent.click(screen.getByRole('button', { name: /^Runs/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('where').textContent).toBe('/projects?panel=runs')
  })
})
