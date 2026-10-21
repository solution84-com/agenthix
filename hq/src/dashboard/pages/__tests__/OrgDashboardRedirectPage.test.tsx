// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrgDashboardRedirectPage } from '../OrgDashboardRedirectPage'

describe('the old Dashboard address @SC-665', () => {
  it('goes to the Organisation page', () => {
    render(
      <MemoryRouter initialEntries={['/org/dashboard']}>
        <Routes>
          <Route path="/org/dashboard" element={<OrgDashboardRedirectPage />} />
          <Route path="/org" element={<p>the organisation</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('the organisation')).toBeTruthy()
  })
})
