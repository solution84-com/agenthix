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

import { SidebarFooter } from '../sidebar/SidebarFooter'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderFoot(props: Partial<React.ComponentProps<typeof SidebarFooter>> = {}, at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <SidebarFooter collapsed={false} onToggleCollapse={vi.fn()} {...props} />
      <button>elsewhere</button>
      <Where />
    </MemoryRouter>,
  )
}
const trigger = () => screen.getByRole('button', { name: 'sam, account menu' })
const menu = () => screen.queryByRole('menu', { name: 'Account' })

beforeEach(() => { vi.clearAllMocks(); me.role = 'MEMBER' })

describe('the foot: you @SC-1045', () => {
  it('shows your avatar and name, with the menu closed and no Overview, Your settings or Sign out rows', () => {
    renderFoot()
    expect(within(trigger()).getByText('SA')).toBeTruthy()
    expect(within(trigger()).getByText('sam')).toBeTruthy()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(menu()).toBeNull()
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Your settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('opens a menu grouped by whose each item is: the organisation’s Overview, then yours, the first focused', () => {
    renderFoot()
    fireEvent.click(trigger())
    const items = within(menu()!).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Overview', 'Your settings', 'Sign out'])
    expect(items[0].getAttribute('href')).toBe('/org')
    expect(items[1].getAttribute('href')).toBe('/settings')
    expect(within(menu()!).getByText('Fernhill')).toBeTruthy()
    expect(document.activeElement).toBe(items[0])
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('offers Manage, marked Admin, to organisation admins only', () => {
    me.role = 'ADMIN'
    renderFoot()
    fireEvent.click(trigger())
    const items = within(menu()!).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Overview', 'ManageAdmin', 'Your settings', 'Sign out'])
    expect(items[1].getAttribute('href')).toBe('/admin')
  })

  it('marks the page you are on', () => {
    renderFoot({}, '/settings/profile')
    fireEvent.click(trigger())
    expect(within(menu()!).getByRole('menuitem', { name: 'Your settings' }).getAttribute('aria-current')).toBe('page')
    expect(within(menu()!).getByRole('menuitem', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })

  it('goes where a link says, closes, and lets a phone drawer close', () => {
    const onNavigate = vi.fn()
    renderFoot({ onNavigate })
    fireEvent.click(trigger())
    fireEvent.click(within(menu()!).getByRole('menuitem', { name: 'Overview' }))
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
    expect(document.activeElement).toBe(items[2])
  })
})

describe('the foot: collapse @SC-1045', () => {
  it('is a button on your row, « when expanded and » when collapsed', () => {
    const onToggleCollapse = vi.fn()
    const { unmount } = renderFoot({ onToggleCollapse })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    unmount()
    renderFoot({ collapsed: true, onToggleCollapse })
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeTruthy()
  })

  it('is not offered where the navigation cannot collapse (the phone drawer)', () => {
    renderFoot({ onToggleCollapse: undefined })
    expect(screen.queryByRole('button', { name: /navigation$/ })).toBeNull()
  })
})

describe('the foot: icon width @SC-1045', () => {
  it('is your avatar alone, named on hover, opening the same menu to the side', () => {
    renderFoot({ collapsed: true })
    expect(trigger().getAttribute('title')).toBe('sam')
    expect(screen.queryByText('sam')).toBeNull()
    fireEvent.click(trigger())
    expect(within(menu()!).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Overview', 'Your settings', 'Sign out'])
  })
})

describe('the foot: Pinned row @SC-1045', () => {
  it('sits above you, in the same place whatever it holds', () => {
    renderFoot({ pinned: <p>Agenthix pin</p> })
    const foot = screen.getByTestId('sidebar-foot')
    expect(foot.children).toHaveLength(2)
    expect(foot.children[0].textContent).toBe('Agenthix pin')
    expect(within(foot.children[1] as HTMLElement).getByRole('button', { name: 'sam, account menu' })).toBeTruthy()
  })

  it('leaves only you when there is no row', () => {
    renderFoot({ pinned: null })
    expect(screen.getByTestId('sidebar-foot').children).toHaveLength(1)
  })
})
