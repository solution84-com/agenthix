// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { SkillsRedirectPage } from '../SkillsRedirectPage'

function Where() {
  const l = useLocation()
  return <p>{l.pathname}{l.search}</p>
}

describe('the old Skills address @SC-678', () => {
  it('goes to the Library’s Skills tab', () => {
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <Routes>
          <Route path="/skills" element={<SkillsRedirectPage />} />
          <Route path="/library" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('/library?tab=skills')).toBeTruthy()
  })
})
