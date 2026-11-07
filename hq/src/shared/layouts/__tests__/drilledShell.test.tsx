// @vitest-environment jsdom
/**
 * A place through the whole shell: a place's screen hands the root shell its place, whose menu opens beside the
 * rail on a wide screen and is a drawer of its own on a phone.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useLocation } from 'react-router'

const size = vi.hoisted(() => ({ dock: 'wide' as 'wide' | 'medium' | 'narrow', mobile: false }))
vi.mock('../../../dock/useDockWidth', () => ({ useDockWidth: () => size.dock }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => size.mobile }))
vi.mock('../../../pins/components/PinButton', () => ({ PinButton: () => <button aria-label="Pin" /> }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../components/sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../ShellPanelButtons', () => ({ ShellPanelButtons: () => null }))
vi.mock('@agenthix/ui/primitives', async (importOriginal) => ({ ...(await importOriginal<object>()), PlaceAvatar: () => null }))
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
const placeMenu = () => screen.queryByRole('navigation', { name: 'Agenthix menu' })
const where = () => screen.getByTestId('where').textContent
const sections = () => within(placeMenu()!).getByRole('list', { name: 'Agenthix sections' })

beforeEach(() => {
  localStorage.clear()
  size.dock = 'wide'
  size.mobile = false
})

describe('a place, through the root shell', () => {
  it('wide: the rail keeps the places, the place’s menu beside it with names and counts, the breadcrumb from Home @SC-1021 @SC-1044', () => {
    renderApp()
    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toBeTruthy()
    expect(within(sections()).getByRole('link', { current: 'page' }).textContent).toBe('Boards3')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs.textContent).toBe('Home/Projects/Agenthix/Boards')
    expect(within(crumbs).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Agenthix, find a project'])
  })

  it('moving between sections marks the new one and keeps the same rail and menu @SC-1021', () => {
    renderApp()
    const rail = mainNav()
    fireEvent.click(within(sections()).getByRole('link', { name: /Tasks/ }))
    expect(where()).toBe('/projects/AGX?tool=tasks')
    expect(screen.getByText('the tasks view')).toBeTruthy()
    expect(within(sections()).getByRole('link', { current: 'page' }).textContent).toContain('Tasks')
    expect(mainNav()).toBe(rail)
  })

  it('hiding the menu gives the page the width and puts the show icon at the breadcrumb’s start; it stays hidden across a reload', () => {
    const { unmount } = renderApp()
    fireEvent.click(within(placeMenu()!).getByRole('button', { name: "Hide Agenthix's menu" }))
    expect(placeMenu()).toBeNull()
    const show = screen.getByRole('button', { name: "Show Agenthix's menu" })
    expect(show.nextElementSibling).toBe(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(where()).toBe('/projects/AGX?tool=boards')
    unmount()
    renderApp()
    expect(placeMenu()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: "Show Agenthix's menu" }))
    expect(placeMenu()).not.toBeNull()
    expect(screen.queryByRole('button', { name: "Show Agenthix's menu" })).toBeNull()
  })

  it('medium (1024–1279): the menu is icons, names on hover @SC-1022', () => {
    size.dock = 'medium'
    renderApp()
    expect(within(sections()).getByRole('link', { name: 'Boards · 3' }).textContent).toBe('3')
    expect(within(placeMenu()!).queryByText('Boards')).toBeNull()
  })

  it('narrow: the drawer is the main navigation, and the header is the place’s with Back @SC-1022', () => {
    size.dock = 'narrow'
    size.mobile = true
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'open drawer' }))
    expect(within(mainNav()).getByText('Home')).toBeTruthy()
    expect(placeMenu()).toBeNull()
    const header = within(screen.getByTestId('mobile-header'))
    expect(header.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/projects')
    expect(header.getByRole('button', { name: 'Agenthix menu' })).toBeTruthy()
    expect(screen.queryByText('own header')).toBeNull()
  })

  it('leaving the place from the rail closes its menu; the rail does not move @SC-1021', () => {
    renderApp()
    const rail = mainNav()
    fireEvent.click(within(rail).getByRole('link', { name: 'Tasks' }))
    expect(where()).toBe('/tasks')
    expect(mainNav()).toBe(rail)
    expect(placeMenu()).toBeNull()
  })
})
