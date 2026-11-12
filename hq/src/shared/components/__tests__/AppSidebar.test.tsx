// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// --- Module mocks ---
// lucide-react: the real icons, but the ones the sidebar draws are plain nulls, which keeps the render light.

vi.mock('wasp/client/auth', () => ({
  useAuth: () => ({ data: { identities: { username: { id: 'testuser' } } } }),
  logout: vi.fn(),
}))

const me = vi.hoisted(() => ({ role: 'MEMBER' }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: (q: string) => ({ data: q === 'getUserSettings' ? { role: me.role } : undefined }),
  getOrgIdentity: 'getOrgIdentity',
  getUserSettings: 'getUserSettings',
}))

vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lucide-react')>()),
  AudioLines: () => null,
  House: () => null,
  MessageSquare: () => null,
  UserRound: () => null,
  FolderKanban: () => null,
  FolderGit2: () => null,
  Bot: () => null,
  CircleDot: () => null,
  Library: () => null,
  Building2: () => null,
  Settings: () => null,
  ShieldCheck: () => null,
  ChevronLeft: () => null,
  LogOut: () => null,
  Pin: () => null,
  PinOff: () => null,
  X: () => null,
  // The drilled-in panel's section icons.
  LayoutDashboard: () => null, MessagesSquare: () => null, SquareCheck: () => null, Kanban: () => null,
  GanttChart: () => null, Play: () => null, Repeat: () => null, Folder: () => null, Diamond: () => null,
  BookOpen: () => null, GitBranch: () => null, Users: () => null, Brain: () => null, Activity: () => null,
  Gauge: () => null, ScrollText: () => null, Circle: () => null,
}))

const counts = { unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }
vi.mock('../../layouts/useShellCounts', () => ({ useShellCounts: () => counts }))
vi.mock('../../layouts/ShellPanelButtons', () => ({
  ShellPanelButtons: () => React.createElement('div', { 'data-testid': 'panel-buttons' }),
  ShellPanelRows: () => React.createElement('div', { 'data-testid': 'panel-rows' }),
}))

const mobile = { value: false }
vi.mock('../sidebar/OrgSwitcher', () => ({ OrgSwitcher: ({ collapsed }: { collapsed: boolean }) => <p data-testid="org">{collapsed ? 'picture' : 'row'}</p> }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

// Controllable NavDrawer mock — state is mutated per test via mockNavDrawer
const mockCloseDrawer = vi.fn()
const mockNavDrawer = { open: false, openDrawer: vi.fn(), closeDrawer: mockCloseDrawer, toggleDrawer: vi.fn() }

vi.mock('../../context/NavDrawerContext', () => ({
  useNavDrawer: () => mockNavDrawer,
  NavDrawerProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

// Import AFTER all vi.mock declarations
import { AppSidebar } from '../AppSidebar'

// --- Helpers ---

const PLACES = ['Home', 'Chat', 'Your space', 'Projects', 'Boards', 'Your tasks', 'Workspaces', 'Routines', 'Workrooms', 'Agents', 'Library']

function renderSidebar(props: Partial<React.ComponentProps<typeof AppSidebar>> = {}, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppSidebar {...props} />
    </MemoryRouter>,
  )
}

const nav = () => screen.getByRole('navigation', { name: 'Main' })
const placeLabels = () => within(nav()).getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  mockNavDrawer.open = false
  mobile.value = false
  me.role = 'MEMBER'
  counts.runsNeedingYou = 0
})

// --- Tests ---

describe('the phone: the main drawer @SC-220', () => {
  it('slides in from the left when open, and is off-screen when closed', () => {
    mobile.value = true
    mockNavDrawer.open = true
    const { unmount } = renderSidebar()
    expect(nav().className.split(' ')).toContain('translate-x-0')
    unmount()
    mockNavDrawer.open = false
    renderSidebar()
    expect(nav().className.split(' ')).toContain('-translate-x-full')
  })

  it('closes when a place is chosen', () => {
    mobile.value = true
    mockNavDrawer.open = true
    renderSidebar()
    fireEvent.click(screen.getByText('Home').closest('a')!)
    expect(mockCloseDrawer).toHaveBeenCalled()
  })

  it('lists the eleven places as rows in three groups, the organisation with ✕ first, and Notifications, Runs and you in the foot', () => {
    mobile.value = true
    mockNavDrawer.open = true
    renderSidebar()
    expect(placeLabels().filter((l) => l !== 'Voice lab' && l !== 'Voice playground')).toEqual(PLACES)
    expect(screen.getAllByTestId('places-divider').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('org').textContent).toBe('row')
    const foot = screen.getByTestId('sidebar-foot')
    expect(within(foot).getByText('testuser')).toBeTruthy()
    expect(within(foot).getByTestId('panel-rows')).toBeTruthy()
    expect(screen.queryByTestId('panel-buttons')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close the menu' }))
    expect(mockCloseDrawer).toHaveBeenCalled()
  })

  it('is 300 px wide over the screen', () => {
    mobile.value = true
    renderSidebar()
    expect(nav().className.split(' ')).toContain('w-[300px]')
  })

  it('is never a place’s menu, even inside one', () => {
    mobile.value = true
    renderSidebar({ placeNav: { kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', avatarUrl: null, current: 'overview', sections: [] } })
    expect(within(nav()).getByText('Home')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Agenthix menu' })).toBeNull()
  })
})

describe('the rail @SC-011 @SC-150', () => {
  it('lists the eleven places in three groups with a divider between, each an icon alone, named by a tooltip (D20)', () => {
    renderSidebar()
    expect(placeLabels().filter((l) => l !== 'Voice lab' && l !== 'Voice playground')).toEqual(PLACES)
    const order = [...nav().querySelectorAll('a, [data-testid="places-divider"]')].map((e) => e.getAttribute('aria-label') ?? 'divider')
    expect(order.slice(0, order.indexOf('Library') + 1)).toEqual(['Home', 'Chat', 'Your space', 'divider', 'Projects', 'Boards', 'Your tasks', 'Workspaces', 'Routines', 'Workrooms', 'divider', 'Agents', 'Library'])
    expect(screen.getByRole('link', { name: 'Your tasks' }).getAttribute('href')).toBe('/tasks')
    expect(screen.queryByText('You')).toBeNull()
    expect(screen.getByRole('link', { name: 'Your space' }).textContent).toBe('')
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('/chat')
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('href')).toBe('/library')
    expect(['Boards', 'Workspaces', 'Routines'].map((n) => screen.getByRole('link', { name: n }).getAttribute('href'))).toEqual(['/boards', '/workspaces', '/routines'])
    expect(screen.getByTestId('org').textContent).toBe('picture')
  })

  it('shows a place’s name as a tooltip on hover and on keyboard focus, and keeps it as the link’s name', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: 'Projects' })
    expect(link.getAttribute('title')).toBeNull()
    fireEvent.mouseEnter(link)
    expect(screen.getByTestId('tooltip').textContent).toBe('Projects')
    fireEvent.mouseLeave(link)
    expect(screen.queryByTestId('tooltip')).toBeNull()
    fireEvent.focus(screen.getByRole('link', { name: 'Agents' }))
    expect(screen.getByTestId('tooltip').textContent).toBe('Agents')
  })

  it('is 56 px wide, and the phone’s drawer keeps the labels', () => {
    renderSidebar()
    expect(nav().className).toContain('lg:w-14')
    expect(nav().className).not.toContain('72px')
  })

  it('has no pinned projects, no Organisation or Settings place, and no collapse button', () => {
    renderSidebar()
    expect(screen.queryByRole('region', { name: 'Pinned' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Organisation' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: /navigation$/ })).toBeNull()
  })

  it('puts Manage below the places for organisation admins only, then notifications, then you', () => {
    const { unmount } = renderSidebar()
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull()
    unmount()
    me.role = 'ADMIN'
    renderSidebar()
    const foot = screen.getByTestId('sidebar-foot')
    const order = [...foot.querySelectorAll('a, [data-testid="panel-buttons"], button')].map((e) => e.getAttribute('aria-label') ?? e.getAttribute('data-testid'))
    expect(order).toEqual(['Manage', 'panel-buttons', 'testuser, account menu'])
    expect(within(foot).getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe('/admin')
    // The divider is the foot's top edge, so Library sits above it and Manage below.
    expect(foot.contains(screen.getByRole('link', { name: 'Library' }))).toBe(false)
  })

  it('marks the place you are on: Library on the old Skills address, Projects only on its list, Your space at its own', () => {
    const { unmount } = renderSidebar({}, '/skills')
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBe('page')
    unmount()
    const second = renderSidebar({}, '/projects/AGX')
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBeNull()
    second.unmount()
    // A project's own boards are its tool, not the rail's Boards.
    const third = renderSidebar({}, '/projects/AGX/boards/b1')
    expect(screen.getByRole('link', { name: 'Boards' }).getAttribute('aria-current')).toBeNull()
    third.unmount()
    const fourth = renderSidebar({}, '/routines')
    expect(screen.getByRole('link', { name: 'Routines' }).getAttribute('aria-current')).toBe('page')
    fourth.unmount()
    renderSidebar({}, '/space')
    expect(screen.getByRole('link', { name: 'Your space' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('aria-current')).toBeNull()
  })

  it('gives Your tasks no count: what needs the person lives in Runs only (D9)', () => {
    counts.runsNeedingYou = 2
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Your tasks' }).textContent).toBe('')
  })

  it("leads Workrooms to every project's Workroom on one page, and marks it there", () => {
    renderSidebar({}, '/workrooms')
    const link = screen.getByRole('link', { name: 'Workrooms' })
    expect(link.getAttribute('href')).toBe('/workrooms')
    expect(link.getAttribute('aria-current')).toBe('page')
  })

  it('highlights none of the places on the Runs history', () => {
    renderSidebar({}, '/runs')
    expect(within(nav()).queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toEqual([])
  })

  it('opens no place menu outside a place', () => {
    renderSidebar()
    expect(screen.queryByTestId('place-menu')).toBeNull()
  })
})
