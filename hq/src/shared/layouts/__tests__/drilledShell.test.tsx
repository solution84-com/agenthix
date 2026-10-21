// @vitest-environment jsdom
/**
 * The drilled-in navigation through the whole shell: a place's screen hands the root shell its place, and the
 * one navigation drills into it at every width.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useLocation } from 'react-router'

const size = vi.hoisted(() => ({ dock: 'wide' as 'wide' | 'medium' | 'narrow', mobile: false }))
vi.mock('../../../dock/useDockWidth', () => ({ useDockWidth: () => size.dock }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => size.mobile }))
vi.mock('../../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => <p>pins</p> }))
vi.mock('../../../pins/components/PinButton', () => ({ PinButton: () => <button aria-label="Pin" /> }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../components/sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../ShellPanelButtons', () => ({ ShellPanelButtons: () => null }))
vi.mock('../useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, tasksNeedingYou: 0 }) }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'sam' } } } }), logout: vi.fn() }))
// The shell asks which conversation to fill an empty dock with; here it never learns.
vi.mock('wasp/client/operations', async (importOriginal) => ({ ...(await importOriginal<object>()), useQuery: () => ({ data: undefined }) }))

import { RootShell } from '../RootShell'
import { NavDrawerProvider, useNavDrawer } from '../../context/NavDrawerContext'
import { PlaceScreen } from '../../../places/components/PlaceScreen'
import { testPlace } from '../../../places/__tests__/placeFixture'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function DrawerOpener() {
  const { openDrawer } = useNavDrawer()
  return <button onClick={openDrawer}>open drawer</button>
}

function renderApp(at = '/projects/AGX?tool=boards') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <NavDrawerProvider>
        <Routes>
          <Route element={<RootShell><Where /><DrawerOpener /><Outlet /></RootShell>}>
            <Route path="/projects/AGX" element={
              <PlaceScreen
                place={testPlace()}
                breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }]}
                mobileHeader={<header>own header</header>}
                conversations={<div>the conversations</div>}
              />
            } />
            <Route path="/tasks" element={<PlaceScreen place={testPlace()} breadcrumbs={[]} mobileHeader={null} conversations={null} isPlace={false} />} />
          </Route>
        </Routes>
      </NavDrawerProvider>
    </MemoryRouter>,
  )
}

const mainNav = () => screen.getByRole('navigation', { name: 'Main' })
const where = () => screen.getByTestId('where').textContent
const sections = () => within(mainNav()).getByRole('list', { name: 'Agenthix sections' })

beforeEach(() => {
  localStorage.clear()
  size.dock = 'wide'
  size.mobile = false
})

describe('a place, through the root shell', () => {
  it('wide: the panel is the place with names and counts, the breadcrumb lists @SC-1021 @SC-1044', () => {
    renderApp()
    expect(within(sections()).getByRole('link', { current: 'page' }).textContent).toBe('Boards3')
    expect(within(mainNav()).queryByText('Home')).toBeNull()
    expect(within(mainNav()).getByText('pins')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Agenthix sections' })).toBeNull()
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Projects', 'Agenthix', 'Boards'])
  })

  it('moving between sections marks the new one and keeps the same navigation @SC-1021', () => {
    renderApp()
    const nav = mainNav()
    fireEvent.click(within(sections()).getByRole('link', { name: /Tasks/ }))
    expect(where()).toBe('/projects/AGX?tool=tasks')
    expect(screen.getByText('the tasks view')).toBeTruthy()
    expect(within(sections()).getByRole('link', { current: 'page' }).textContent).toContain('Tasks')
    expect(mainNav()).toBe(nav)
  })

  it('medium (1024–1279): icons, names on hover, the main navigation still behind ‹ @SC-1022', () => {
    size.dock = 'medium'
    renderApp()
    expect(within(sections()).getByRole('link', { name: 'Boards · 3' }).textContent).toBe('3')
    expect(within(mainNav()).queryByText('Boards')).toBeNull()
    fireEvent.click(within(mainNav()).getByRole('button', { name: 'Show the main navigation' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(where()).toBe('/projects/AGX?tool=boards')
  })

  it('narrow: the drawer is the full panel, and the header names the section @SC-1022', () => {
    size.dock = 'narrow'
    size.mobile = true
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'open drawer' }))
    expect(within(sections()).getByText('Boards')).toBeTruthy()
    const header = screen.getByTestId('mobile-header')
    expect(within(header).getByRole('button', { name: 'Boards, Agenthix sections' })).toBeTruthy()
    expect(screen.queryByText('own header')).toBeNull()
  })

  it('‹ and dismissing: the canvas is not touched, nothing navigates @SC-1043', () => {
    renderApp()
    const canvas = screen.getByTestId('place-canvas')
    fireEvent.click(within(mainNav()).getByRole('button', { name: 'Show the main navigation' }))
    expect(screen.getByRole('dialog', { name: 'Go to' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('main-nav-overlay-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('place-canvas')).toBe(canvas)
    expect(where()).toBe('/projects/AGX?tool=boards')
  })

  it('leaving the place for a page with no sections puts back the main navigation @SC-1021', () => {
    renderApp()
    fireEvent.click(within(mainNav()).getByRole('button', { name: 'Show the main navigation' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Go to' })).getByRole('link', { name: /Tasks/ }))
    expect(where()).toBe('/tasks')
    expect(within(mainNav()).getByText('Home')).toBeTruthy()
    expect(screen.queryByTestId('place-panel')).toBeNull()
  })
})
