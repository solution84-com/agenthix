// @vitest-environment jsdom
/**
 * A place's navigation: the left panel drilled into a place, and ‹ showing the main navigation over it,
 * dismissible without anything moving.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Link, useLocation, useNavigate } from 'react-router'

vi.mock('wasp/client/auth', () => ({
  useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'testuser' } } } }),
  logout: vi.fn(),
}))
vi.mock('@agenthix/ui', () => ({ Logomark: () => null, Wordmark: () => null }))
vi.mock('@agenthix/ui/primitives', () => ({
  PlaceAvatar: ({ id, name }: { id: string; name: string }) => <span data-testid="place-avatar" data-id={id}>{name[0]}</span>,
}))
vi.mock('../AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="agent-avatar">{name[0]}</span> }))
vi.mock('../../../pins/components/PinButton', () => ({
  PinButton: ({ kind, itemId }: { kind: string; itemId: string }) => <button aria-label="Pin" data-kind={kind} data-id={itemId} />,
}))
vi.mock('lucide-react', () => {
  const Icon = () => null
  return Object.fromEntries([
    'AudioLines', 'House', 'MessageSquare', 'UserRound', 'FolderKanban', 'Bot', 'CircleDot', 'Building2', 'Settings', 'ChevronLeft',
    'LogOut', 'Pin', 'PinOff', 'X', 'LayoutDashboard', 'MessagesSquare', 'SquareCheck', 'Kanban', 'GanttChart', 'Play',
    'Repeat', 'Folder', 'Diamond', 'BookOpen', 'GitBranch', 'Users', 'Brain', 'Activity', 'Gauge', 'ScrollText', 'Circle',
  ].map((n) => [n, Icon]))
})
vi.mock('../../layouts/useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, tasksNeedingYou: 2 }) }))
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

const pins = <ul><li><Link to="/projects/AGX">Agenthix pin</Link></li><li><Link to="/projects/WEB">Website pin</Link></li></ul>

/** The conversation beside the page opening, as the dock puts it in the address. */
function OpenBeside() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  return <button onClick={() => navigate(`${pathname}${search}&c=c9`, { replace: true })}>open beside</button>
}

function renderPanel({ collapsed = false, at = '/projects/AGX?tool=boards', nav = project }: { collapsed?: boolean; at?: string; nav?: PlaceNav } = {}) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppSidebar collapsed={collapsed} onToggleCollapse={() => {}} pinned={pins} placeNav={nav} />
      <div data-testid="canvas" style={{ overflow: 'auto', height: 100 }}>canvas</div>
      <Where />
      <OpenBeside />
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent
const back = () => screen.getByRole('button', { name: 'Show the main navigation' })
const sections = () => screen.getByRole('list', { name: 'Agenthix sections' })
const overlay = () => screen.queryByRole('dialog', { name: 'Go to' })

beforeEach(() => {
  mobile.value = false
  drawer.open = false
  drawer.closeDrawer = vi.fn()
})

describe('the drilled-in panel, expanded @SC-1024 @SC-1021', () => {
  it('shows the place in place of the main navigation: ‹, its avatar, its name to Overview, its pin', () => {
    renderPanel()
    const header = screen.getByTestId('place-panel-header')
    expect(within(header).getByRole('button', { name: 'Show the main navigation' })).toBeTruthy()
    expect(within(header).getByTestId('place-avatar').getAttribute('data-id')).toBe('p1')
    expect(within(header).getByRole('link', { name: /Agenthix/ }).getAttribute('href')).toBe('/projects/AGX')
    expect(within(header).getByRole('button', { name: 'Pin' }).getAttribute('data-kind')).toBe('PROJECT')
    // The main navigation's places are not in the panel; the foot (Pinned, then you) stays.
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    expect(screen.queryByText('Chat')).toBeNull()
    const foot = screen.getByTestId('sidebar-foot')
    expect(within(foot).getByText('Website pin')).toBeTruthy()
    expect(within(foot).getByRole('button', { name: 'testuser, account menu' })).toBeTruthy()
  })

  it('lists every section with its count under group labels, the one shown marked', () => {
    renderPanel()
    const links = within(sections()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([
      'Overview', 'Conversations', 'Tasks1 needs you · 12', 'Boards3', 'Runs2', 'AutomationOn', 'Members6', 'Settings',
    ])
    expect(links.find((a) => a.getAttribute('aria-current') === 'page')?.textContent).toBe('Boards3')
    expect(links[2].getAttribute('href')).toBe('/projects/AGX?tool=tasks')
    for (const label of ['Work', 'Agents at work', 'Project']) expect(within(sections()).getByText(label)).toBeTruthy()
  })

  it('pins an agent by its own kind, and has no pin for your space', () => {
    const { unmount } = renderPanel({ nav: { ...project, kind: 'agent', id: 'a1', name: 'Kernel', homePath: '/agents/kernel' } })
    expect(screen.getByRole('button', { name: 'Pin' }).getAttribute('data-kind')).toBe('AGENT')
    expect(screen.getByTestId('agent-avatar')).toBeTruthy()
    unmount()
    renderPanel({ nav: { ...project, kind: 'space', id: null, name: 'Your space', homePath: '/space' } })
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.getByTestId('place-avatar').getAttribute('data-id')).toBe('u1')
  })
})

describe('‹ shows the main navigation over the panel @SC-1043', () => {
  it('opens Go to with the main navigation, focus on ✕, and goes nowhere', () => {
    renderPanel()
    fireEvent.click(back())
    const dialog = overlay()!
    for (const label of ['Home', 'Chat', 'Your space', 'Projects', 'Agents', 'Tasks']) {
      expect(within(dialog).getByRole('link', { name: new RegExp(label) })).toBeTruthy()
    }
    // The same foot as the panel's: Pinned, then you.
    expect(within(within(dialog).getByTestId('sidebar-foot')).getByText('Website pin')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'testuser, account menu' })).toBeTruthy()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }))
    expect(where()).toBe('/projects/AGX?tool=boards')
  })

  it.each([
    ['✕', () => fireEvent.click(within(overlay()!).getByRole('button', { name: 'Close' }))],
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click outside', () => fireEvent.click(screen.getByTestId('main-nav-overlay-backdrop'))],
    ['choosing the place you are in', () => fireEvent.click(within(overlay()!).getByText('Agenthix pin'))],
  ])('closes on %s with nothing moved: the same section, the same scroll, focus back on ‹', (_how, dismiss) => {
    renderPanel()
    const canvas = screen.getByTestId('canvas')
    canvas.scrollTop = 240
    fireEvent.click(back())
    dismiss()
    expect(overlay()).toBeNull()
    expect(where()).toBe('/projects/AGX?tool=boards')
    expect(screen.getByTestId('canvas')).toBe(canvas)
    expect(canvas.scrollTop).toBe(240)
    expect(document.activeElement).toBe(back())
    expect(within(sections()).getByRole('link', { current: 'page' }).textContent).toBe('Boards3')
  })

  it('stays open when only the conversation beside the page opens', () => {
    renderPanel()
    fireEvent.click(back())
    fireEvent.click(screen.getByRole('button', { name: 'open beside' }))
    expect(where()).toBe('/projects/AGX?tool=boards&c=c9')
    expect(overlay()).not.toBeNull()
  })

  it('goes where the person chooses, and closes', () => {
    renderPanel()
    fireEvent.click(back())
    fireEvent.click(within(overlay()!).getByRole('link', { name: /Tasks/ }))
    expect(where()).toBe('/tasks')
    expect(overlay()).toBeNull()
  })

  it('goes to another pinned project', () => {
    renderPanel()
    fireEvent.click(back())
    fireEvent.click(within(overlay()!).getByText('Website pin'))
    expect(where()).toBe('/projects/WEB')
  })
})

describe('the drilled-in panel collapsed, as on a medium window @SC-1022', () => {
  it('shows ‹, the avatar, one icon per section with its name on hover and its count as a badge', () => {
    renderPanel({ collapsed: true })
    expect(back()).toBeTruthy()
    expect(within(screen.getByTestId('place-panel-header')).getByRole('link', { name: 'Agenthix' }).getAttribute('href')).toBe('/projects/AGX')
    const tasks = screen.getByRole('link', { name: 'Tasks · 1 needs you · 12' })
    expect(tasks.getAttribute('title')).toBe('Tasks · 1 needs you · 12')
    expect(within(tasks).getByTestId('section-badge').textContent).toBe('1')
    expect(screen.getByRole('link', { name: 'Overview' }).textContent).toBe('')
    // No group labels and no names on the strip.
    expect(screen.queryByText('Work')).toBeNull()
    expect(screen.queryByText('Boards')).toBeNull()
    expect(within(screen.getByRole('link', { name: 'Automation · On' })).queryByTestId('section-badge')).toBeNull()
  })

  it('opens the main navigation at full panel width over the canvas from ‹', () => {
    renderPanel({ collapsed: true })
    fireEvent.click(back())
    expect(within(overlay()!).getByText('Home')).toBeTruthy()
  })
})

describe('the drilled-in panel in the phone drawer @SC-1022 @SC-1043', () => {
  it('is the full panel whatever the collapsed setting, and ‹ swaps to the main navigation', () => {
    mobile.value = true
    drawer.open = true
    renderPanel({ collapsed: true })
    expect(within(sections()).getByText('Boards')).toBeTruthy()
    fireEvent.click(back())
    expect(within(overlay()!).getByText('Home')).toBeTruthy()
  })

  it('tapping outside dismisses the drawer too, and nothing moves', () => {
    mobile.value = true
    drawer.open = true
    renderPanel()
    fireEvent.click(back())
    fireEvent.click(screen.getByTestId('main-nav-overlay-backdrop'))
    expect(overlay()).toBeNull()
    expect(drawer.closeDrawer).toHaveBeenCalled()
    expect(where()).toBe('/projects/AGX?tool=boards')
  })
})
