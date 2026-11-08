// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const logout = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/auth', () => ({
  useAuth: () => ({ data: { identities: { username: { id: 'sam' } } } }),
  logout,
}))

const me = vi.hoisted(() => ({ role: 'MEMBER' as 'ADMIN' | 'MEMBER' }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({ data: q === 'getOrgIdentity' ? { name: 'Fernhill' } : { role: me.role } }),
  getOrgIdentity: 'getOrgIdentity',
  getUserSettings: 'getUserSettings',
}))

vi.mock('../../layouts/ShellPanelButtons', () => ({
  ShellPanelButtons: () => <div data-testid="panel-buttons" />,
  ShellPanelRows: () => <div data-testid="panel-rows" />,
}))

import { SidebarFooter } from '../sidebar/SidebarFooter'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderFoot(props: Partial<React.ComponentProps<typeof SidebarFooter>> = {}, at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <SidebarFooter rail={false} {...props} />
      <button>elsewhere</button>
      <Where />
    </MemoryRouter>,
  )
}
const trigger = () => screen.getByRole('button', { name: 'sam, account menu' })
const menu = () => screen.queryByRole('menu', { name: 'Account' })

beforeEach(() => { vi.clearAllMocks(); me.role = 'MEMBER' })

describe('the foot: you @SC-1045', () => {
  it('shows your avatar and name, with the menu closed and no Organisation, Your settings or Sign out rows', () => {
    renderFoot()
    expect(within(trigger()).getByText('SA')).toBeTruthy()
    expect(within(trigger()).getByText('sam')).toBeTruthy()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(menu()).toBeNull()
    expect(screen.queryByRole('link', { name: 'Organisation' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Your settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('opens your menu: who you are and where, your settings, the organisation, help and sign out, the first focused', () => {
    renderFoot()
    fireEvent.click(trigger())
    const items = within(menu()!).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Your settings', 'Organisation', 'Help and the guide ↗', 'Sign out'])
    expect(items[0].getAttribute('href')).toBe('/settings')
    expect(items[1].getAttribute('href')).toBe('/org')
    expect(items[2].getAttribute('target')).toBe('_blank')
    expect(within(menu()!).getByText('Fernhill')).toBeTruthy()
    expect(document.activeElement).toBe(items[0])
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('puts Manage above you, for organisation admins only, and not in your menu', () => {
    const { unmount } = renderFoot()
    expect(screen.queryByRole('link', { name: /Manage/ })).toBeNull()
    unmount()
    me.role = 'ADMIN'
    renderFoot()
    expect(screen.getByRole('link', { name: /Manage/ }).getAttribute('href')).toBe('/admin')
    fireEvent.click(trigger())
    expect(within(menu()!).queryByText('Manage')).toBeNull()
  })

  it('marks the page you are on', () => {
    renderFoot({}, '/settings/profile')
    fireEvent.click(trigger())
    expect(within(menu()!).getByRole('menuitem', { name: 'Your settings' }).getAttribute('aria-current')).toBe('page')
    expect(within(menu()!).getByRole('menuitem', { name: 'Organisation' }).getAttribute('aria-current')).toBeNull()
  })

  it('goes where a link says, closes, and lets a phone drawer close', () => {
    const onNavigate = vi.fn()
    renderFoot({ onNavigate })
    fireEvent.click(trigger())
    fireEvent.click(within(menu()!).getByRole('menuitem', { name: 'Organisation' }))
    expect(screen.getByTestId('where').textContent).toBe('/org')
    expect(menu()).toBeNull()
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('signs out from the menu', () => {
    renderFoot()
    fireEvent.click(trigger())
    fireEvent.click(within(menu()!).getByRole('menuitem', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(menu()).toBeNull()
  })

  it('closes on Esc with focus back on your name, and on a click outside', () => {
    renderFoot()
    fireEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())

    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(menu()).toBeNull()
  })

  it('moves through the menu with the arrow keys', () => {
    renderFoot()
    fireEvent.click(trigger())
    const items = within(menu()!).getAllByRole('menuitem')
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: 'ArrowUp' })
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[3])
  })
})

describe('the foot in the rail @SC-1045', () => {
  it('is your initials alone, named on hover, opening the same menu to the side, with notifications above', () => {
    renderFoot({ rail: true })
    expect(trigger().getAttribute('aria-label')).toBe('sam, account menu')
    expect(screen.queryByText('sam')).toBeNull()
    expect(screen.getByTestId('panel-buttons')).toBeTruthy()
    fireEvent.click(trigger())
    expect(within(menu()!).getAllByRole('menuitem')).toHaveLength(4)
  })

  it('holds Notifications and Runs as rows in the phone’s drawer, not icons', () => {
    renderFoot()
    expect(screen.getByTestId('panel-rows')).toBeTruthy()
    expect(screen.queryByTestId('panel-buttons')).toBeNull()
  })
})
