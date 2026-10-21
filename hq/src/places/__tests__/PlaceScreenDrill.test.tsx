// @vitest-environment jsdom
/** A place's screen: the sections go to the left panel and the breadcrumb; the canvas is the section. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import type { Breadcrumb } from '../../shared/layouts/ScreenBar'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'

vi.mock('../../shared/layouts/AppShell', () => ({
  AppShell: ({ children, breadcrumbs, mobileHeader, placeNav }: {
    children: React.ReactNode; breadcrumbs: Breadcrumb[]; mobileHeader: React.ReactNode; placeNav?: PlaceNav | null
  }) => (
    <div>
      <output data-testid="crumbs">{breadcrumbs.map((c) => `${c.label}${c.list ? ' ▾' : ''}`).join(' / ')}</output>
      <output data-testid="place-nav">{JSON.stringify(placeNav ?? null)}</output>
      <div data-testid="mobile-slot">{mobileHeader}</div>
      {children}
    </div>
  ),
}))
vi.mock('../../shared/layouts/ShellPanelButtons', () => ({ ShellPanelButtons: () => null }))

import { PlaceScreen } from '../components/PlaceScreen'
import { testPlace } from './placeFixture'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(path: string, { isPlace }: { isPlace?: boolean } = {}) {
  const screenOf = (
    <PlaceScreen
      place={testPlace()}
      breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }]}
      mobileHeader={<header>the page’s own header</header>}
      conversations={<div>the conversations</div>}
      isPlace={isPlace}
    />
  )
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/projects/AGX" element={screenOf} /></Routes>
      <Where />
    </MemoryRouter>,
  )
}

const placeNav = () => JSON.parse(screen.getByTestId('place-nav').textContent!) as PlaceNav | null
const where = () => screen.getByTestId('where').textContent

describe('a place’s screen', () => {
  it('draws no section row; the canvas is the section @SC-1021', () => {
    renderAt('/projects/AGX?tool=boards')
    expect(screen.queryByRole('navigation', { name: 'Agenthix sections' })).toBeNull()
    expect(screen.getByText('the boards view')).toBeTruthy()
    expect(screen.getByTestId('place-canvas').getAttribute('data-section')).toBe('boards')
  })

  it('hands the shell the place and the section shown, from the same address @SC-1021', () => {
    renderAt('/projects/AGX?tool=boards')
    expect(placeNav()).toMatchObject({ kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', current: 'boards' })
    expect(placeNav()!.sections.map((s) => s.id)).toEqual(['overview', 'conversations', 'tasks', 'boards', 'timeline', 'runs', 'members', 'settings'])
  })

  it('keeps the same Overview at the place’s own address @SC-1021', () => {
    renderAt('/projects/AGX')
    expect(placeNav()!.current).toBe('overview')
    expect(screen.getByTestId('place-overview')).toBeTruthy()
  })

  it('makes every part of the breadcrumb a list, ending with the section @SC-1044', () => {
    renderAt('/projects/AGX?tool=boards')
    expect(screen.getByTestId('crumbs').textContent).toBe('Home ▾ / Projects ▾ / Agenthix ▾ / Boards ▾')
  })

  it('on a small screen, the header names the section and its title opens the place’s sections @SC-1022', () => {
    renderAt('/projects/AGX?tool=boards')
    const header = within(screen.getByTestId('mobile-slot'))
    expect(header.queryByText('the page’s own header')).toBeNull()
    expect(header.getByText('Agenthix')).toBeTruthy()
    fireEvent.click(header.getByRole('button', { name: 'Boards, Agenthix sections' }))
    const list = screen.getByRole('menu', { name: 'Agenthix sections' })
    expect(within(list).getByRole('menuitem', { current: 'page' }).textContent).toContain('Boards')
    fireEvent.click(within(list).getByRole('menuitem', { name: /Tasks/ }))
    expect(where()).toBe('/projects/AGX?tool=tasks')
    expect(screen.getByText('the tasks view')).toBeTruthy()
  })

  it('leaves a screen that is not a place’s sections (Chat) on the main navigation @SC-1021', () => {
    renderAt('/projects/AGX', { isPlace: false })
    expect(placeNav()).toBeNull()
  })
})
