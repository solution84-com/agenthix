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

const counts = { unreadNotifications: 0, runsInProgress: 0, tasksNeedingYou: 0 }
vi.mock('../../layouts/useShellCounts', () => ({ useShellCounts: () => counts }))
vi.mock('../../layouts/ShellPanelButtons', () => ({
  ShellPanelButtons: ({ vertical }: { vertical?: boolean }) =>
    React.createElement('div', { 'data-testid': 'panel-buttons', 'data-vertical': String(!!vertical) }),
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
  counts.tasksNeedingYou = 0
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

  it('lists the places as rows with their full names, the organisation first and you at the foot, notifications left to the top bar', () => {
    mobile.value = true
    renderSidebar()
    for (const label of ['Home', 'Chat', 'Your space', 'Projects', 'Boards', 'Tasks', 'Workspaces', 'Routines', 'Agents', 'Library']) expect(within(nav()).getByText(label)).toBeTruthy()
    expect(screen.getByTestId('org').textContent).toBe('row')
    expect(within(screen.getByTestId('sidebar-foot')).getByText('testuser')).toBeTruthy()
    expect(screen.queryByTestId('panel-buttons')).toBeNull()
  })

  it('is never a place’s menu, even inside one', () => {
    mobile.value = true
    renderSidebar({ placeNav: { kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', avatarUrl: null, current: 'overview', sections: [] } })
    expect(within(nav()).getByText('Home')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Agenthix menu' })).toBeNull()
  })
})

describe('the rail @SC-011 @SC-150', () => {
  it('lists Home, Chat, Your space, Projects, Boards, Tasks, Workspaces, Routines, Agents and Library in that order, each an icon alone, named by a tooltip', () => {
    renderSidebar()
    expect(placeLabels().filter((l) => l !== 'Voice lab')).toEqual(['Home', 'Chat', 'Your space', 'Projects', 'Boards', 'Tasks', 'Workspaces', 'Routines', 'Agents', 'Library'])
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
    expect(screen.getByTestId('panel-buttons').getAttribute('data-vertical')).toBe('true')
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

  it('shows how many tasks need the person on Tasks, as a badge', () => {
    counts.tasksNeedingYou = 2
    renderSidebar()
    const tasks = screen.getByRole('link', { name: 'Tasks, 2 need you' })
    expect(within(tasks).getByText('2')).toBeTruthy()
  })

  it('opens no place menu outside a place', () => {
    renderSidebar()
    expect(screen.queryByTestId('place-menu')).toBeNull()
  })
})
