// @vitest-environment jsdom
/**
 * Inside a place: the rail stays, and the place's menu opens beside it with its name ▾ (Find a project), its pin and
 * the icon that hides it.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('wasp/client/auth', () => ({
  useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'testuser' } } } }),
  logout: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({
    data: q === 'getProjects'
      ? [
          { id: 'p1', key: 'AGX', name: 'Agenthix', isMember: true },
          { id: 'p2', key: 'WEB', name: 'Website relaunch', isMember: true },
          { id: 'p3', key: 'CUS', name: 'Customer research', isMember: true },
        ]
      : q === 'getPins' ? [{ id: 'pin1', kind: 'PROJECT', itemId: 'p2' }] : undefined,
  }),
  getOrgIdentity: 'getOrgIdentity',
  getUserSettings: 'getUserSettings',
  getProjects: 'getProjects',
  getPins: 'getPins',
}))
vi.mock('@agenthix/ui/primitives', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  PlaceAvatar: ({ id, name }: { id: string; name: string }) => <span data-testid="place-avatar" data-id={id}>{name[0]}</span>,
}))
vi.mock('../AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="agent-avatar">{name[0]}</span> }))
vi.mock('../../../pins/components/PinButton', () => ({
  PinButton: ({ kind, itemId }: { kind: string; itemId: string }) => <button aria-label="Pin" data-kind={kind} data-id={itemId} />,
}))
vi.mock('lucide-react', async (importOriginal) => {
  const Icon = () => null
  return { ...(await importOriginal<typeof import('lucide-react')>()), ...Object.fromEntries([
    'AudioLines', 'House', 'MessageSquare', 'UserRound', 'FolderKanban', 'Bot', 'CircleDot', 'Library', 'Building2', 'Settings', 'ShieldCheck', 'ChevronLeft',
    'LogOut', 'Pin', 'PinOff', 'X', 'LayoutDashboard', 'MessagesSquare', 'SquareCheck', 'Kanban', 'GanttChart', 'Play',
    'Repeat', 'Folder', 'Diamond', 'BookOpen', 'GitBranch', 'Users', 'Brain', 'Activity', 'Gauge', 'ScrollText', 'Circle',
  ].map((n) => [n, Icon])) }
})
vi.mock('../../layouts/useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 2 }) }))
vi.mock('../../layouts/ShellPanelButtons', () => ({ ShellPanelButtons: () => null }))
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))
const drawer = vi.hoisted(() => ({ open: false, openDrawer: () => {}, closeDrawer: () => {}, toggleDrawer: () => {} }))
vi.mock('../../context/NavDrawerContext', () => ({ useNavDrawer: () => drawer }))

import { AppSidebar } from '../AppSidebar'
import type { PlaceNav } from '../../layouts/placeNavTypes'

const project: PlaceNav = {
  kind: 'project',
  id: 'p1',
  name: 'Agenthix',
  homePath: '/projects/AGX',
  avatarUrl: null,
  current: 'boards',
  sections: [
    { id: 'overview', label: 'Overview', href: '/projects/AGX', group: null },
    { id: 'conversations', label: 'Conversations', href: '/projects/AGX?tool=conversations', group: null },
    { id: 'tasks', label: 'Tasks', count: '1 needs you · 12', tone: 'needs', href: '/projects/AGX?tool=tasks', group: 'Work' },
    { id: 'boards', label: 'Boards', count: '3', href: '/projects/AGX?tool=boards', group: 'Work' },
    { id: 'runs', label: 'Runs', count: '2', tone: 'live', href: '/projects/AGX?tool=runs', group: 'Agents at work' },
    { id: 'automation', label: 'Automation', count: 'On', tone: 'live', href: '/projects/AGX?tool=automation', group: 'Agents at work' },
    { id: 'members', label: 'Members', count: '6', href: '/projects/AGX?tool=members', group: 'Project' },
    { id: 'settings', label: 'Settings', href: '/projects/AGX?tool=settings', group: 'Project' },
  ],
}

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderPanel({ icons = false, hidden = false, at = '/projects/AGX?tool=boards', nav = project, onToggleMenu = vi.fn() }: {
  icons?: boolean; hidden?: boolean; at?: string; nav?: PlaceNav; onToggleMenu?: () => void
} = {}) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppSidebar placeNav={nav} menuIcons={icons} menuHidden={hidden} onToggleMenu={onToggleMenu} />
      <Where />
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent
const menu = () => screen.getByRole('navigation', { name: 'Agenthix menu' })
const sections = () => screen.getByRole('list', { name: 'Agenthix sections' })
const finder = () => screen.queryByRole('dialog', { name: 'Find a project' })

beforeEach(() => {
  mobile.value = false
  drawer.open = false
})

describe('a place’s menu beside the rail @SC-1024 @SC-1021', () => {
  it('opens beside the rail, which keeps the app’s places', () => {
    renderPanel()
    const rail = screen.getByRole('navigation', { name: 'Main' })
    expect(within(rail).getByRole('link', { name: 'Home' })).toBeTruthy()
    expect(rail.contains(menu())).toBe(false)
    expect(rail.nextElementSibling).toBe(menu())
  })

  it('has the place for its header: its avatar, its name ▾, its pin and the hide icon, with no ‹', () => {
    renderPanel()
    const header = within(screen.getByTestId('place-menu-header'))
    expect(header.getByTestId('place-avatar').getAttribute('data-id')).toBe('p1')
    expect(header.getByRole('button', { name: 'Agenthix, find a project' }).getAttribute('aria-haspopup')).toBe('dialog')
    expect(header.getByRole('button', { name: 'Pin' }).getAttribute('data-kind')).toBe('PROJECT')
    expect(header.getByRole('button', { name: "Hide Agenthix's menu" })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show the main navigation' })).toBeNull()
  })

  it('lists every section with its count under group labels, the one shown marked', () => {
    renderPanel()
    const links = within(sections()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([
      'Overview', 'Conversations', 'Tasks1 needs you · 12', 'Boards3', 'Runs2', 'AutomationOn', 'Members6', 'Settings',
    ])
    expect(links.find((a) => a.getAttribute('aria-current') === 'page')?.textContent).toBe('Boards3')
    for (const label of ['Work', 'Agents at work', 'Project']) expect(within(sections()).getByText(label)).toBeTruthy()
  })

  it('hides from its icon, and is not drawn while hidden', () => {
    const onToggleMenu = vi.fn()
    const { unmount } = renderPanel({ onToggleMenu })
    fireEvent.click(screen.getByRole('button', { name: "Hide Agenthix's menu" }))
    expect(onToggleMenu).toHaveBeenCalledTimes(1)
    unmount()
    renderPanel({ hidden: true })
    expect(screen.queryByTestId('place-menu')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
  })

  it('pins an agent by its own kind, whose name opens its page rather than Find a project; your space has no pin', () => {
    const { unmount } = renderPanel({ nav: { ...project, kind: 'agent', id: 'a1', name: 'Kernel', homePath: '/agents/kernel' } })
    expect(screen.getByRole('button', { name: 'Pin' }).getAttribute('data-kind')).toBe('AGENT')
    expect(screen.getByRole('link', { name: /Kernel/ }).getAttribute('href')).toBe('/agents/kernel')
    expect(screen.queryByRole('button', { name: /find a project/ })).toBeNull()
    unmount()
    renderPanel({ nav: { ...project, kind: 'space', id: null, name: 'Your space', homePath: '/space' } })
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Your space, find a project' })).toBeTruthy()
  })
})

describe('Find a project from the menu’s header @SC-1044', () => {
  it('lists pinned projects first, then the others A–Z, the one you are in marked, and all projects', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Agenthix, find a project' }))
    const dialog = within(finder()!)
    expect(within(dialog.getByRole('region', { name: 'Pinned' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['WWebsite relaunch'])
    const others = within(dialog.getByRole('region', { name: 'Other projects' })).getAllByRole('link')
    expect(others.map((a) => a.textContent)).toEqual(['AAgenthixhere', 'CCustomer research'])
    expect(others[0].getAttribute('aria-current')).toBe('page')
    expect(dialog.getByRole('link', { name: 'All projects →' }).getAttribute('href')).toBe('/projects')
  })

  it('lands on the same section of the project chosen, and closes', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Agenthix, find a project' }))
    fireEvent.click(within(finder()!).getByRole('link', { name: /Website relaunch/ }))
    expect(where()).toBe('/projects/WEB?tool=boards')
    expect(finder()).toBeNull()
  })

  it('narrows to the names that hold the search', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Agenthix, find a project' }))
    fireEvent.change(within(finder()!).getByRole('searchbox'), { target: { value: 'cust' } })
    expect(within(finder()!).getAllByRole('link').map((a) => a.textContent)).toEqual(['CCustomer research', 'All projects →'])
  })

  it.each([
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click outside', () => fireEvent.click(screen.getByTestId('find-project-outside'))],
  ])('closes on %s with nothing moved', (_how, dismiss) => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Agenthix, find a project' }))
    dismiss()
    expect(finder()).toBeNull()
    expect(where()).toBe('/projects/AGX?tool=boards')
  })
})

describe('the menu at icon width, as on a medium window @SC-1022', () => {
  it('shows the avatar, the hide icon, and one icon per section with its name on hover and its count as a badge', () => {
    renderPanel({ icons: true })
    expect(within(screen.getByTestId('place-menu-header')).getByRole('link', { name: 'Agenthix' }).getAttribute('href')).toBe('/projects/AGX')
    expect(screen.getByRole('button', { name: "Hide Agenthix's menu" })).toBeTruthy()
    const tasks = screen.getByRole('link', { name: 'Tasks · 1 needs you · 12' })
    expect(within(tasks).getByTestId('section-badge').textContent).toBe('1')
    expect(screen.queryByText('Work')).toBeNull()
  })
})
