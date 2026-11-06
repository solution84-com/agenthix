// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ScreenBar, documentTitle, fromHome } from '../ScreenBar'
import type { PlaceNav } from '../placeNavTypes'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getProjects: 'getProjects', getPins: 'getPins' }))

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

describe('every screen’s breadcrumb starts at Home', () => {
  it('puts Home first, as a link, unless it is already there; Home’s own is just Home', () => {
    expect(fromHome([{ label: 'Projects' }])).toEqual([{ label: 'Home', href: '/' }, { label: 'Projects' }])
    expect(fromHome([{ label: 'Home', href: '/' }, { label: 'Tasks' }])).toEqual([{ label: 'Home', href: '/' }, { label: 'Tasks' }])
    expect(fromHome([])).toEqual([{ label: 'Home', href: undefined }])
  })

  it('draws Home on the Projects list', () => {
    render(<MemoryRouter><ScreenBar breadcrumbs={[{ label: 'Projects' }]} /></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('Home/Projects')
  })
})

describe('the show icon while a place’s menu is hidden', () => {
  const nav: PlaceNav = { kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', avatarUrl: null, current: 'overview', sections: [] }

  it('leads the breadcrumb only while the menu is hidden, and shows it again', () => {
    const onShowMenu = vi.fn()
    const { unmount } = render(<MemoryRouter><ScreenBar placeNav={nav} menuHidden={false} onShowMenu={onShowMenu} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: "Show Agenthix's menu" })).toBeNull()
    unmount()
    render(<MemoryRouter><ScreenBar placeNav={nav} menuHidden onShowMenu={onShowMenu} /></MemoryRouter>)
    const show = screen.getByRole('button', { name: "Show Agenthix's menu" })
    expect(show.nextElementSibling).toBe(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    fireEvent.click(show)
    expect(onShowMenu).toHaveBeenCalledTimes(1)
  })

  it('is not drawn outside a place', () => {
    render(<MemoryRouter><ScreenBar menuHidden onShowMenu={() => {}} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /menu/ })).toBeNull()
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
