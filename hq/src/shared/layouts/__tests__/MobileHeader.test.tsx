// @vitest-environment jsdom
/**
 * @SC-220 @SC-221
 * The phone's top bar (spec, *The phone*): ☰ (a dot when something needs the person), the title, the chat and one ⋯;
 * Notifications and Runs are in the drawer, not here.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('lucide-react', async (importOriginal) => ({ ...(await importOriginal<typeof import('lucide-react')>()), Menu: () => null }))
const mockOpenDrawer = vi.fn()
vi.mock('../../context/NavDrawerContext', () => ({
  useNavDrawer: () => ({ openDrawer: mockOpenDrawer, open: false, closeDrawer: vi.fn(), toggleDrawer: vi.fn() }),
}))
const counts = vi.hoisted(() => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }))
vi.mock('../useShellCounts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../useShellCounts')>()), useShellCounts: () => counts }))
vi.mock('../../../dock/DockPhoneButton', () => ({ DockPhoneButton: () => <button data-testid="dock-phone-button" /> }))

import { MobileHeader } from '../MobileHeader'
import { PhoneActionsProvider, usePhoneActions } from '../phoneActions'

beforeEach(() => { counts.unreadNotifications = 0; counts.runsNeedingYou = 0 })

function Screen({ actions }: { actions: Parameters<typeof usePhoneActions>[0] }) {
  usePhoneActions(actions)
  return null
}

describe('MobileHeader @SC-220 @SC-221 @SC-152', () => {
  it('opens the drawer from ☰', () => {
    render(<MobileHeader title="Agenthix" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(mockOpenDrawer).toHaveBeenCalledTimes(1)
  })

  it('shows the title and the chat, no Notifications or Runs, and only below the lg breakpoint', () => {
    render(<MobileHeader title="Agenthix" />)
    expect(screen.getByText('Agenthix')).toBeTruthy()
    expect(screen.getByTestId('dock-phone-button')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Notifications|Runs/ })).toBeNull()
    expect(screen.getByTestId('mobile-header').className.split(' ')).toContain('lg:hidden')
  })

  it('puts a dot on ☰ while something needs the person', () => {
    const { unmount } = render(<MobileHeader title="Agenthix" />)
    expect(screen.queryByTestId('menu-dot')).toBeNull()
    unmount()
    counts.runsNeedingYou = 2
    counts.unreadNotifications = 3
    render(<MobileHeader title="Agenthix" />)
    expect(screen.getByTestId('menu-dot')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open menu, 5 need you' })).toBeTruthy()
  })

  it('has no ⋯ when the screen has no actions', () => {
    render(<PhoneActionsProvider><MobileHeader title="Home" /></PhoneActionsProvider>)
    expect(screen.queryByRole('button', { name: 'Actions for this screen' })).toBeNull()
  })

  it('holds the screen’s actions behind one ⋯, the main one first and chosen, then closes', () => {
    const onNew = vi.fn()
    const onArchive = vi.fn()
    render(
      <PhoneActionsProvider>
        <MobileHeader title="Projects" />
        <Screen actions={[{ label: 'New project', onSelect: onNew }, { label: 'Archive', onSelect: onArchive, danger: true }, { label: 'Export', onSelect: vi.fn(), disabledWhy: 'Only admins export. Nothing was changed.' }]} />
      </PhoneActionsProvider>,
    )
    const more = screen.getByRole('button', { name: 'Actions for this screen' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.firstChild?.textContent)).toEqual(['New project', 'Archive', 'Export'])
    expect(items[0].className).toContain('bg-selected')
    expect(items[1].className).toContain('text-danger')
    expect(items[2].getAttribute('aria-disabled')).toBe('true')
    expect(items[2].textContent).toContain('Only admins export.')
    expect(document.activeElement).toBe(items[0])
    fireEvent.click(items[2])
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(items[0])
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the ⋯ on Escape, focus back on it', () => {
    render(
      <PhoneActionsProvider>
        <MobileHeader title="Projects" />
        <Screen actions={[{ label: 'New project', onSelect: vi.fn() }]} />
      </PhoneActionsProvider>,
    )
    const more = screen.getByRole('button', { name: 'Actions for this screen' })
    fireEvent.click(more)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  it('drops the actions when the screen that put them there goes', () => {
    const { rerender } = render(
      <PhoneActionsProvider>
        <MobileHeader title="Projects" />
        <Screen actions={[{ label: 'New project', onSelect: vi.fn() }]} />
      </PhoneActionsProvider>,
    )
    expect(screen.getByRole('button', { name: 'Actions for this screen' })).toBeTruthy()
    rerender(<PhoneActionsProvider><MobileHeader title="Projects" /></PhoneActionsProvider>)
    expect(screen.queryByRole('button', { name: 'Actions for this screen' })).toBeNull()
  })
})
