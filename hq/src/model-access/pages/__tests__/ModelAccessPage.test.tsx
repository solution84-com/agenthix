// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (fn: unknown) => fn,
  getUserSettings: 'getUserSettings',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, breadcrumbs }: { children: React.ReactNode; breadcrumbs: { label: string }[] }) => (
    <div data-testid="layout" data-crumbs={breadcrumbs.map(b => b.label).join(' / ')}>{children}</div>
  ),
}))
vi.mock('react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('../WebSearchKeyBlock', () => ({ WebSearchKeyBlock: () => <div data-testid="web-search" /> }))

import { ModelAccessPage } from '../ModelAccessPage'

function settingsAre(value: { data?: { role: string }; isLoading?: boolean }) {
  useQuery.mockReturnValue({ isLoading: false, ...value })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the web-search page, under Organisation › Settings', () => {
  it('gives an admin the web-search key, and says where model providers are now', () => {
    settingsAre({ data: { role: 'ADMIN' } })
    render(<ModelAccessPage />)
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe('Manage organisation / Settings / Web search')
    expect(screen.getByText(/Model and voice providers are under Manage organisation/)).toBeTruthy()
    expect(screen.getByTestId('web-search')).toBeTruthy()
  })

  it('tells anyone else it is for admins and shows no section', () => {
    settingsAre({ data: { role: 'MEMBER' } })
    render(<ModelAccessPage />)
    expect(screen.getByText(/Only an organisation admin can see the organisation's settings/)).toBeTruthy()
    expect(screen.queryByTestId('web-search')).toBeNull()
  })

  it('shows neither while the role is loading', () => {
    settingsAre({ isLoading: true })
    render(<ModelAccessPage />)
    expect(screen.queryByText(/Only an organisation admin/)).toBeNull()
    expect(screen.queryByTestId('web-search')).toBeNull()
  })
})
