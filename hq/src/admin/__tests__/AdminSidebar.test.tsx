// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ role: 'ADMIN' as string }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => q === 'getOrgIdentity' ? { data: { name: 'Fernhill' } } : { data: { role: ops.role }, isLoading: false },
  getOrgIdentity: 'getOrgIdentity', getUserSettings: 'getUserSettings',
}))

import { AdminSidebar } from '../components/AdminSidebar'

const show = (at: string) => render(<MemoryRouter initialEntries={[at]}><AdminSidebar fallback={<nav aria-label="Main">main navigation</nav>} /></MemoryRouter>)
afterEach(cleanup)

describe('the admin area menu @SC-1189', () => {
  it('replaces the main navigation, with Back to the organisation first', () => {
    ops.role = 'ADMIN'
    show('/admin')
    expect(screen.queryByText('main navigation')).toBeNull()
    expect(screen.getByRole('link', { name: /Back to Fernhill/ }).getAttribute('href')).toBe('/org')
  })

  it('holds the groups an admin manages, in order', () => {
    ops.role = 'ADMIN'
    show('/admin')
    const menu = screen.getByTestId('admin-menu')
    const links = within(menu).getAllByRole('link').map(a => a.textContent)
    expect(links).toEqual([
      'Back to Fernhill', 'Overview', 'People and invitations', 'Teams', 'Agents', 'AI', 'Billing profiles', 'Usage',
      'General', 'GitHub', 'Automation', 'Runs', 'Memory', 'Library and skills', 'Tool risk rules', 'Sites', 'Sites for projects', 'Infrastructure',
    ])
  })

  it('marks the page the admin is on, and only it', () => {
    ops.role = 'ADMIN'
    show('/admin/settings/runs')
    const current = screen.getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page').map(a => a.textContent)
    expect(current).toEqual(['Runs'])
  })

  it('marks Overview only at /admin, not under it', () => {
    ops.role = 'ADMIN'
    show('/admin/people/u1')
    const current = screen.getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page').map(a => a.textContent)
    expect(current).toEqual(['People and invitations'])
  })

  it('shows a member the main navigation and no admin menu', () => {
    ops.role = 'MEMBER'
    show('/admin')
    expect(screen.getByText('main navigation')).toBeTruthy()
    expect(screen.queryByTestId('admin-menu')).toBeNull()
  })
})

describe('Models and billing in the admin menu', () => {
  it('reads AI, Billing profiles and Usage, with AI marked on the AI page', () => {
    ops.role = 'ADMIN'
    show('/admin/ai')
    const current = screen.getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page')
    expect(current.map(a => a.textContent)).toEqual(['AI'])
    expect(current[0].getAttribute('href')).toBe('/admin/ai')
    expect(screen.queryByRole('link', { name: 'Providers' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Models' })).toBeNull()
  })
})
