// @vitest-environment jsdom
/**
 * The shell is drawn once, in the app's root: pages hand it their parts through
 * `AppShell`, and navigating between them never unmounts it (spec §15).
 */
import React, { createContext, useContext, useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, Link } from 'react-router'

const mounts = vi.hoisted(() => ({ sidebar: 0 }))
vi.mock('../../components/AppSidebar', () => ({
  AppSidebar: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) => {
    const [instance] = React.useState(() => ++mounts.sidebar)
    return (
      <nav data-testid="sidebar" data-instance={instance} data-collapsed={String(collapsed)}>
        <button onClick={onToggleCollapse}>collapse</button>
      </nav>
    )
  },
}))
vi.mock('../../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
vi.mock('../MobileHeader', () => ({ MobileHeader: ({ title }: { title: string }) => <header data-testid="mobile-header">{title}</header> }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))
// A wide window: the person's own navigation setting applies.
vi.mock('../../../dock/useDockWidth', () => ({ useDockWidth: () => 'wide' }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
// The shell asks which conversation to fill an empty dock with; here it never learns.
vi.mock('wasp/client/operations', async (importOriginal) => ({ ...(await importOriginal<object>()), useQuery: () => ({ data: undefined }) }))

import { RootShell } from '../RootShell'
import { AppShell } from '../AppShell'
import { AppLayout } from '../AppLayout'
import { NavDrawerProvider, useNavDrawer } from '../../context/NavDrawerContext'

const PageWord = createContext('none')

function BarButton() {
  return <button>{useContext(PageWord)} action</button>
}

function DrawerOpener() {
  const { openDrawer } = useNavDrawer()
  return <button onClick={openDrawer}>open drawer</button>
}

function Nav() {
  return (
    <>
      <Link to="/a">to a</Link>
      <Link to="/b">to b</Link>
      <Link to="/place">to place</Link>
      <Link to="/loading">to loading</Link>
      <Link to="/bare">to bare</Link>
      <DrawerOpener />
    </>
  )
}

function LoadingThenLoaded() {
  const [loaded, setLoaded] = useState(false)
  if (!loaded) return <AppShell key="loading" breadcrumbs={[{ label: '…' }]}><button onClick={() => setLoaded(true)}>load</button></AppShell>
  return <AppShell key="loaded" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Loaded' }]}><span>loaded</span></AppShell>
}

function renderApp(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <NavDrawerProvider>
        <Routes>
          <Route element={<RootShell><Nav /><Outlet /></RootShell>}>
            <Route path="/a" element={<AppLayout breadcrumbs={[{ label: 'Alpha' }]}><span>page a</span></AppLayout>} />
            <Route path="/b" element={<AppShell breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: 'Beta' }]}><span>page b</span></AppShell>} />
            <Route path="/place" element={
              <PageWord.Provider value="place">
                <AppShell breadcrumbs={[{ label: 'Place' }]} screenBarRight={<BarButton />} mobileHeader={<header data-testid="place-header">‹ Place</header>}>
                  <span>place page</span>
                </AppShell>
              </PageWord.Provider>
            } />
            <Route path="/loading" element={<LoadingThenLoaded />} />
            <Route path="/bare" element={<span>sign in</span>} />
          </Route>
        </Routes>
      </NavDrawerProvider>
    </MemoryRouter>,
  )
}

const go = (name: string) => fireEvent.click(screen.getByRole('link', { name }))
const bar = () => screen.getByTestId('screen-bar')

beforeEach(() => {
  mounts.sidebar = 0
  try { localStorage.clear() } catch { /* jsdom always has it */ }
})

describe('the shell drawn once in the root @SC-1020', () => {
  it('keeps the same navigation mounted while moving between pages', () => {
    renderApp('/a')
    expect(screen.getByText('page a')).toBeTruthy()
    const nav = screen.getByTestId('sidebar')
    go('to b')
    expect(screen.getByText('page b')).toBeTruthy()
    go('to place')
    expect(screen.getByTestId('sidebar')).toBe(nav)
    expect(mounts.sidebar).toBe(1)
  })

  it('draws no frame for a page that renders no shell', () => {
    renderApp('/bare')
    expect(screen.getByText('sign in')).toBeTruthy()
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.queryByTestId('screen-bar')).toBeNull()
    expect(screen.queryByTestId('mobile-header')).toBeNull()
  })

  it('drops the frame on leaving for a page without one, and draws it again on return', () => {
    renderApp('/a')
    go('to bare')
    expect(screen.queryByTestId('sidebar')).toBeNull()
    go('to a')
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    expect(bar().textContent).toContain('Alpha')
  })

  it('shows each page’s breadcrumbs, and names the browser tab after them', () => {
    renderApp('/a')
    expect(bar().textContent).toContain('Alpha')
    expect(document.title).toBe('Alpha · Agenthix')
    go('to b')
    expect(bar().textContent).toContain('Beta')
    expect(bar().textContent).not.toContain('Alpha')
    expect(screen.getByTestId('mobile-header').textContent).toBe('Beta')
    expect(document.title).toBe('Beta · Tasks · Agenthix')
    go('to bare')
    expect(document.title).toBe('Agenthix')
  })

  it('puts a page’s bar buttons and mobile header in the frame, with the page’s own context, and takes them away after', () => {
    renderApp('/place')
    expect(screen.getByTestId('screen-bar-right').textContent).toBe('place action')
    expect(screen.getByTestId('place-header')).toBeTruthy()
    expect(screen.queryByTestId('mobile-header')).toBeNull()
    go('to a')
    expect(screen.getByTestId('screen-bar-right').textContent).toBe('')
    expect(screen.queryByTestId('place-header')).toBeNull()
    expect(screen.getByTestId('mobile-header').textContent).toBe('Alpha')
  })

  it('leaves nothing stale when a page swaps one shell for another as it loads', () => {
    renderApp('/loading')
    expect(bar().textContent).toContain('…')
    fireEvent.click(screen.getByText('load'))
    expect(bar().textContent).toBe('Projects/Loaded')
    expect(screen.getByTestId('mobile-header').textContent).toBe('Loaded')
    expect(mounts.sidebar).toBe(1)
  })

  it('keeps the collapsed navigation across pages', () => {
    renderApp('/a')
    fireEvent.click(screen.getByText('collapse'))
    go('to b')
    expect(screen.getByTestId('sidebar').getAttribute('data-collapsed')).toBe('true')
    expect(localStorage.getItem('navCollapsed')).toBe('1')
  })

  it('closes the navigation drawer on navigating', () => {
    renderApp('/a')
    act(() => { fireEvent.click(screen.getByText('open drawer')) })
    expect(screen.getByTestId('nav-drawer-backdrop')).toBeTruthy()
    go('to b')
    expect(screen.queryByTestId('nav-drawer-backdrop')).toBeNull()
  })

  it('adds no second frame for a shell inside a shell', () => {
    render(
      <MemoryRouter>
        <RootShell>
          <AppShell breadcrumbs={[{ label: 'Outer' }]}>
            <AppShell breadcrumbs={[{ label: 'Inner' }]}><span>inner</span></AppShell>
          </AppShell>
        </RootShell>
      </MemoryRouter>,
    )
    expect(screen.getAllByTestId('sidebar')).toHaveLength(1)
    expect(bar().textContent).toBe('Outer')
  })
})
