// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ useQuery, getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, breadcrumbs }: { children: React.ReactNode; breadcrumbs: { label: string; href?: string }[] }) => (
    <div data-testid="layout" data-crumbs={breadcrumbs.map(b => `${b.label}${b.href ? `(${b.href})` : ''}`).join(' / ')}>{children}</div>
  ),
}))

import { OrgAdminPage } from '../OrgAdminPage'

const roleIs = (role: string | undefined) => useQuery.mockReturnValue(role ? { data: { role }, isLoading: false } : { data: undefined, isLoading: true })
const show = (area: 'settings' | 'infrastructure', title?: string, trail?: { label: string; href: string }[]) =>
  render(<MemoryRouter><OrgAdminPage area={area} title={title} trail={trail}><p>the page</p></OrgAdminPage></MemoryRouter>)

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('Organisation › Settings and › Infrastructure are for organisation admins @SC-1935', () => {
  it('shows an admin the page under its area', () => {
    roleIs('ADMIN')
    show('infrastructure', 'Connect a site', [{ label: 'Execution Sites', href: '/admin/where-work-runs' }])
    expect(screen.getByText('the page')).toBeTruthy()
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe(
      'Manage organisation(/admin) / Infrastructure(/admin/infrastructure) / Execution Sites(/admin/where-work-runs) / Connect a site',
    )
  })

  it("tells a member at Infrastructure's address that only admins can see it, and shows nothing of it", () => {
    roleIs('MEMBER')
    show('infrastructure')
    expect(screen.getByRole('status').textContent).toContain('Only an organisation admin can see Infrastructure.')
    expect(screen.queryByText('the page')).toBeNull()
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe('Manage organisation(/admin) / Infrastructure')
  })

  it("tells a member the organisation's settings are for admins", () => {
    roleIs('MEMBER')
    show('settings', 'Runs')
    expect(screen.getByRole('status').textContent).toContain("Only an organisation admin can see the organisation's settings.")
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('shows neither while the role is loading', () => {
    roleIs(undefined)
    show('settings')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
  })
})
