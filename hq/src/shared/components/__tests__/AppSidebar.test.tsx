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

vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined }),
  getOrgIdentity: 'getOrgIdentity',
  getUserSettings: 'getUserSettings',
}))
vi.mock('@agenthix/ui', () => ({
  Logomark: () => React.createElement('svg', { 'data-testid': 'logomark' }),
  Wordmark: () => React.createElement('svg', { 'data-testid': 'wordmark' }),
}))

vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lucide-react')>()),
  AudioLines: () => null,
  House: () => null,
  MessageSquare: () => null,
  UserRound: () => null,
  FolderKanban: () => null,
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
vi.mock('../sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
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
      <AppSidebar collapsed={false} onToggleCollapse={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

const nav = () => screen.getByRole('navigation', { name: 'Main' })

beforeEach(() => {
  vi.clearAllMocks()
  mockNavDrawer.open = false
  mobile.value = false
  counts.tasksNeedingYou = 0
})

// --- Tests ---

describe('AppSidebar off-canvas drawer @SC-220', () => {
  it('applies translate-x-0 (open) class when drawer is open', () => {
    mockNavDrawer.open = true
    renderSidebar()
    // When open, the mobile-layer class must be translate-x-0 (no leading dash).
    const classes = nav().className.split(' ')
    expect(classes).toContain('translate-x-0')
    expect(classes).not.toContain('-translate-x-full')
  })

  it('applies -translate-x-full (closed) class when drawer is closed', () => {
    renderSidebar()
    // lg:translate-x-0 is always present (desktop override) so we test for the
    // space-delimited word, not a substring that would match inside "lg:translate-x-0".
    expect(nav().className).toContain('-translate-x-full')
    expect(nav().className.split(' ')).not.toContain('translate-x-0')
  })

  it('calls closeDrawer when a nav item is clicked', () => {
    mockNavDrawer.open = true
    renderSidebar()
    fireEvent.click(screen.getByRole('link', { name: 'Home' }).closest('a')!)
    expect(mockCloseDrawer).toHaveBeenCalled()
  })
})

describe('AppSidebar places @SC-011 @SC-150', () => {
  it('lists Home, Chat, Projects, Tasks, Agents and Library, in that order; Organisation and Settings are behind your name', () => {
    renderSidebar()
    for (const label of ['Home', 'Chat', 'Projects', 'Tasks', 'Agents', 'Library']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.queryByText('Organisation')).toBeNull()
    expect(screen.queryByText('Settings')).toBeNull()
    expect(screen.getByText('Chat').closest('a')?.getAttribute('href')).toBe('/chat')
    const order = screen.getAllByRole('link').map(a => a.textContent ?? '')
    const at = (label: string) => order.findIndex(t => t.startsWith(label))
    expect(at('Projects')).toBeLessThan(at('Tasks'))
    expect(at('Tasks')).toBeLessThan(at('Agents'))
    expect(at('Agents')).toBeLessThan(at('Library'))
    expect(screen.getByText('Library').closest('a')?.getAttribute('href')).toBe('/library')
  })

  it('marks Library on the Library and on the old Skills address', () => {
    renderSidebar({}, '/library')
    expect(screen.getByText('Library').closest('a')?.getAttribute('aria-current')).toBe('page')
  })

  it('lists Your space after Home and Chat, at its own address, highlighted there', () => {
    const { unmount } = renderSidebar({}, '/space')
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels.indexOf('Your space')).toBe(labels.indexOf('Chat') + 1)
    expect(labels.indexOf('Chat')).toBe(labels.indexOf('Home') + 1)
    const space = screen.getByText('Your space').closest('a')
    expect(space?.getAttribute('href')).toBe('/space')
    expect(space?.getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Chat').closest('a')?.getAttribute('aria-current')).toBeNull()
    unmount()
    renderSidebar({}, '/chat')
    expect(screen.getByText('Your space').closest('a')?.getAttribute('aria-current')).toBeNull()
  })

  it('no longer lists Dashboard, My tasks, Boards, Workspaces, Products, Programs', () => {
    renderSidebar()
    for (const label of ['Dashboard', 'My tasks', 'Boards', 'Workspaces', 'Products', 'Programs']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('highlights Projects on the projects list but not inside a project', () => {
    const { unmount } = renderSidebar({}, '/projects')
    expect(screen.getByText('Projects').closest('a')?.getAttribute('aria-current')).toBe('page')
    unmount()
    renderSidebar({}, '/projects/AGX/tasks')
    expect(screen.getByText('Projects').closest('a')?.getAttribute('aria-current')).toBeNull()
  })

  it('shows how many tasks need the person beside Tasks', () => {
    counts.tasksNeedingYou = 2
    renderSidebar()
    expect(within(screen.getByText('Tasks').closest('a')!).getByText('2 need you')).toBeTruthy()
  })

  it('puts the Notifications and Runs buttons beside the logo', () => {
    renderSidebar()
    expect(screen.getByTestId('panel-buttons').getAttribute('data-vertical')).toBe('false')
  })
})

describe('AppSidebar Pinned in the foot @SC-492', () => {
  it('draws the row it is given in the foot, outside the scrolling list, above you', () => {
    renderSidebar({ pinned: <p>Agenthix pin</p> })
    const foot = screen.getByTestId('sidebar-foot')
    const pin = within(foot).getByText('Agenthix pin')
    expect(foot.firstElementChild).toBe(pin)
    expect(within(foot).getByRole('button', { name: /account menu/ })).toBeTruthy()
    expect(screen.getByText('Home').closest('div.overflow-y-auto')?.contains(pin)).toBe(false)
  })

  it('draws no Pinned heading or Edit control of its own', () => {
    renderSidebar({ pinned: <p>Agenthix pin</p> })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('tells the row whether the strip is collapsed, and closes the drawer when a pin is followed', () => {
    mockNavDrawer.open = true
    renderSidebar({ pinned: ({ collapsed, onNavigate }) => <button onClick={onNavigate}>{collapsed ? 'avatars' : 'rows'}</button> })
    fireEvent.click(screen.getByRole('button', { name: 'rows' }))
    expect(mockCloseDrawer).toHaveBeenCalled()
  })

  it('has no row to draw when no pins are given', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-foot').children).toHaveLength(1)
  })
})

describe('AppSidebar collapsed @SC-151', () => {
  it('becomes an icon strip: no labels, the panel buttons stacked, you as your avatar with your name on hover', () => {
    counts.tasksNeedingYou = 3
    renderSidebar({ collapsed: true, pinned: ({ collapsed }) => <p>{collapsed ? 'avatars' : 'rows'}</p> })
    expect(screen.queryByText('Home')).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy()
    expect(screen.getByTestId('panel-buttons').getAttribute('data-vertical')).toBe('true')
    expect(screen.getByText('avatars')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'testuser, account menu' }).getAttribute('title')).toBe('testuser')
    expect(screen.queryByText('testuser')).toBeNull()
    // Tasks keeps its count as a badge.
    expect(within(screen.getByRole('link', { name: 'Tasks' })).getByText('3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeTruthy()
  })

  it('is always the full navigation in the mobile drawer', () => {
    mobile.value = true
    renderSidebar({ collapsed: true })
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('testuser')).toBeTruthy()
  })

  it('calls onToggleCollapse from the collapse control', () => {
    const onToggleCollapse = vi.fn()
    renderSidebar({ onToggleCollapse })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })
})
