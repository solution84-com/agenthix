// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mockUseQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery: mockUseQuery,
  getExecutionSites: 'getExecutionSites',
  getUserSettings: 'getUserSettings',
  getMyCloudOffers: 'getMyCloudOffers',
  getOrgIdentity: 'getOrgIdentity',
  dismissCloudOffer: vi.fn(),
}))

import { NoExecutionSiteNotice } from '../NoExecutionSiteNotice'

function registry(sites: { status: string }[] | undefined, role: string | null = 'ADMIN') {
  mockUseQuery.mockImplementation((query: string) =>
    query === 'getUserSettings' ? { data: role ? { role } : undefined } : { data: sites },
  )
}

function renderNotice() {
  return render(
    <MemoryRouter>
      <NoExecutionSiteNotice />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('NoExecutionSiteNotice', () => {
  it('says "No Execution Site is connected" when the registry is empty', () => {
    registry([])
    renderNotice()
    expect(screen.getByRole('status').textContent).toContain('No Execution Site is connected')
  })

  it('says nothing while the registry is still loading', () => {
    registry(undefined)
    renderNotice()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says nothing once a site is registered, even one that is offline', () => {
    registry([{ status: 'OFFLINE' }])
    renderNotice()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('gives an admin a link to Where work runs', () => {
    registry([])
    renderNotice()
    const link = screen.getByRole('link', { name: 'Where work runs' })
    expect(link.getAttribute('href')).toBe('/admin/where-work-runs')
    expect(screen.queryByText('Ask a fleet admin to add one in the Fleet Console.')).toBeNull()
  })

  it('tells anyone else to ask an admin', () => {
    registry([], 'MEMBER')
    renderNotice()
    expect(screen.getByText('Ask a fleet admin to add one in the Fleet Console.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers neither line before it knows who is looking @SC-1118', () => {
    registry([], null)
    renderNotice()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Ask a fleet admin to add one in the Fleet Console.')).toBeNull()
  })

  it('adds nothing when a site is connected', () => {
    registry([{ status: 'ONLINE' }])
    renderNotice()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Ask a fleet admin to add one in the Fleet Console.')).toBeNull()
  })
})
