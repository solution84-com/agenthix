// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ScreenBar, documentTitle } from '../ScreenBar'

describe('ScreenBar @SC-152', () => {
  it('navigates inside the app from a breadcrumb link, without reloading the page', () => {
    render(
      <MemoryRouter initialEntries={['/projects/AGX']}>
        <Routes>
          <Route path="/projects/AGX" element={<ScreenBar breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }]} />} />
          <Route path="/projects" element={<p>Projects list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Projects' })
    // A plain anchor click is not prevented; the router's Link prevents it and navigates itself.
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    fireEvent(link, event)
    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByText('Projects list')).toBeTruthy()
  })

  it('marks the last crumb as the current page', () => {
    render(<MemoryRouter><ScreenBar breadcrumbs={[{ label: 'Chat', href: '/chat' }, { label: 'Coder' }]} /></MemoryRouter>)
    expect(screen.getByText('Coder').getAttribute('aria-current')).toBe('page')
  })

  it('renders what the screen puts on its right', () => {
    render(<MemoryRouter><ScreenBar right={<button>Layout</button>} /></MemoryRouter>)
    expect(screen.getByTestId('screen-bar-right').textContent).toBe('Layout')
  })
})

describe('documentTitle @SC-660', () => {
  it('names the screen by its last two crumbs, the most specific first', () => {
    expect(documentTitle([{ label: 'Projects', href: '/projects' }, { label: 'Website Redesign' }])).toBe('Website Redesign · Projects · Agenthix')
    expect(documentTitle([{ label: 'Tasks' }, { label: 'WEB-19' }, { label: 'Session' }])).toBe('Session · WEB-19 · Agenthix')
  })

  it('names a top-level screen by its one crumb, and a screen without a breadcrumb by the product alone', () => {
    expect(documentTitle([{ label: 'Projects' }])).toBe('Projects · Agenthix')
    expect(documentTitle([])).toBe('Agenthix')
  })
})
