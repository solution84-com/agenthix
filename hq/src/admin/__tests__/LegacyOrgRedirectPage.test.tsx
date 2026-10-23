// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { LegacyOrgRedirectPage } from '../pages/LegacyOrgRedirectPage'

function Where() {
  const { pathname, search, hash } = useLocation()
  return <p data-testid="where">{pathname}{search}{hash}</p>
}

const open = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/org" element={<p>the organisation</p>} />
      <Route path="/org/teams" element={<p>teams for members</p>} />
      <Route path="/org/*" element={<LegacyOrgRedirectPage />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
)

afterEach(cleanup)

describe('old /org addresses redirect to the admin area', () => {
  it('sends a person to their new address, keeping the query', () => {
    open('/org/people/u1?show=invitations')
    expect(screen.getByTestId('where').textContent).toBe('/admin/people/u1?show=invitations')
  })

  it('sends the old settings and sites addresses where they went', () => {
    open('/org/settings/where-work-runs/s1')
    expect(screen.getByTestId('where').textContent).toBe('/admin/where-work-runs/s1')
  })

  it('sends an address it does not know to the organisation', () => {
    open('/org/nonsense')
    expect(screen.getByText('the organisation')).toBeTruthy()
  })

  it('leaves the members\' Teams where it is', () => {
    open('/org/teams')
    expect(screen.getByText('teams for members')).toBeTruthy()
  })
})
