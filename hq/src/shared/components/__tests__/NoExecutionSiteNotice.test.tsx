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

describe('NoExecutionSiteNotice @SC-1931', () => {
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

  it('is a quiet line, never a dialog', () => {
    registry([])
    renderNotice()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('gives an admin Where work runs', () => {
    registry([])
    renderNotice()
    expect(screen.getByRole('button', { name: 'Where work runs' })).toBeTruthy()
    expect(screen.queryByText(/Ask a fleet admin/)).toBeNull()
  })

  it('tells anyone else to ask an admin', () => {
    registry([], 'MEMBER')
    renderNotice()
    expect(screen.getByText(/Ask a fleet admin to add one in the Fleet Console\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Where work runs' })).toBeNull()
  })

  it('offers neither line before it knows who is looking @SC-1118', () => {
    registry([], null)
    renderNotice()
    expect(screen.queryByRole('button', { name: 'Where work runs' })).toBeNull()
    expect(screen.queryByText(/Ask a fleet admin/)).toBeNull()
  })

  it('adds nothing when a site is connected', () => {
    registry([{ status: 'ONLINE' }])
    renderNotice()
    expect(screen.queryByRole('button', { name: 'Where work runs' })).toBeNull()
    expect(screen.queryByText(/Ask a fleet admin/)).toBeNull()
  })
})
