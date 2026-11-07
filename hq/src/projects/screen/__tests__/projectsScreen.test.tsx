// @vitest-environment jsdom
/** The Projects page: projects only, pinned first then by latest activity, the ones you can join apart, one New project. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The ui package resolves its own copy of lucide-react (and React), which cannot render here: its icons are blanked.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, X: icon, Plus: icon, MoreHorizontal: icon }
})

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const reorder = vi.hoisted(() => vi.fn(async () => undefined))
const join = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({ data: data.value[q], isLoading: false }),
  useAction: (a: string) => (a === 'reorderPins' ? reorder : a === 'joinProject' ? join : vi.fn()),
  createProject: 'createProject', createPersonalProject: 'createPersonalProject', getUserSettings: 'getUserSettings', getProjects: 'getProjects', getProducts: 'getProducts', getPrograms: 'getPrograms',
  getExecutionSites: 'getExecutionSites', getProjectCards: 'getProjectCards', getBillingProfileChoices: 'getBillingProfileChoices',
  getPins: 'getPins', pinItem: 'pinItem', unpinItem: 'unpinItem', reorderPins: 'reorderPins', joinProject: 'joinProject',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, action }: { children: React.ReactNode; action: React.ReactNode }) => <div>{action}{children}</div>,
}))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))

import { ProjectsPage } from '../../pages/ProjectsPage'

const open = () => render(<MemoryRouter initialEntries={['/projects']}><ProjectsPage /></MemoryRouter>)

const project = (id: string, key: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, key, name, description: null, productId: null, programId: null, executionSiteId: 's1', personalOwnerId: null,
  isMember: true, myRole: 'MEMBER', updatedAt: '2026-11-01T00:00:00.000Z', ...extra,
})
const line = (projectId: string, extra: Record<string, unknown> = {}) => ({
  projectId, isMember: true, needsYouCount: 0, runningCount: 0, lastRunAt: null, openCount: 0, lastActivityAt: null, ...extra,
})
const hrefs = (region: HTMLElement) => within(region).getAllByRole('link').map(a => a.getAttribute('href'))

beforeEach(() => {
  join.mockClear()
  data.value = {
    getProjects: [project('p1', 'WEB', 'Website Redesign'), project('p2', 'MKT', 'Marketing Website', { myRole: 'VIEWER' })],
    getProducts: [], getPrograms: [], getExecutionSites: [], getProjectCards: { cards: [] },
  }
})
afterEach(cleanup)

describe('the Projects page lists projects only @SC-654', () => {
  it('has no views to switch and one plain New project button', () => {
    open()
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More ways to add' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy()
  })

  it('opens the one New project form', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeTruthy()
  })
})

describe('a project card @SC-656', () => {
  it('says what needs you, what runs and what is open, in that order, or Nothing open', () => {
    data.value.getProjectCards = { cards: [line('p1', { needsYouCount: 2, runningCount: 1, openCount: 6 }), line('p2')] }
    open()
    const states = screen.getAllByTestId('project-state').map(s => s.textContent)
    expect(states).toContain('2 need you · 1 running · 6 open')
    expect(states).toContain('Nothing open')
    expect(screen.queryByText(/Quiet|board/)).toBeNull()
  })

  it('says No description when there is none', () => {
    open()
    expect(screen.getAllByText('No description').length).toBeGreaterThan(0)
  })
})

describe('the order of the list', () => {
  it('lists the projects by their latest activity', () => {
    data.value.getProjects = [project('p1', 'WEB', 'Website Redesign'), project('p2', 'MKT', 'Marketing Website'), project('p3', 'HR', 'HR policies')]
    data.value.getProjectCards = { cards: [
      line('p1', { lastActivityAt: '2026-11-02T00:00:00.000Z' }),
      line('p2', { lastActivityAt: '2026-11-05T00:00:00.000Z' }),
      line('p3', { lastActivityAt: '2026-11-03T00:00:00.000Z' }),
    ] }
    open()
    expect(hrefs(screen.getByRole('region', { name: 'Projects' }))).toEqual(['/projects/MKT', '/projects/HR', '/projects/WEB'])
  })

  it('puts the projects you are not in last, under Other projects you can join, each with Join', async () => {
    data.value.getProjects = [project('p9', 'QTR', 'Quarterly report', { isMember: false, myRole: null }), project('p1', 'WEB', 'Website Redesign')]
    data.value.getProjectCards = { cards: [line('p9', { isMember: false, needsYouCount: 3, openCount: 3 }), line('p1')] }
    open()
    const group = screen.getByRole('region', { name: 'Other projects you can join · 1' })
    expect(hrefs(group)).toEqual(['/projects/QTR'])
    // Not in it: what needs a person there is not "you".
    expect(within(group).getAllByTestId('project-state')[0].textContent).toBe('3 open')
    expect(hrefs(screen.getByRole('region', { name: 'Projects' }))).toEqual(['/projects/WEB'])
    fireEvent.click(within(group).getAllByRole('button', { name: 'Join' })[0])
    await waitFor(() => expect(join).toHaveBeenCalledWith({ projectId: 'p9' }))
    expect(screen.queryByText('Look →')).toBeNull()
  })
})

describe('pinned projects first', () => {
  const pinned = () => {
    data.value.getProjects = [project('p1', 'WEB', 'Website Redesign'), project('p2', 'MKT', 'Marketing Website'), project('p3', 'HR', 'HR policies')]
    data.value.getPins = [
      { id: 'x3', kind: 'PROJECT', itemId: 'p3', name: 'HR policies', href: '/projects/HR', avatarUrl: null },
      { id: 'xb', kind: 'BOARD', itemId: 'b1', name: 'Launch', href: '/projects/WEB/boards/b1', avatarUrl: null },
      { id: 'x2', kind: 'PROJECT', itemId: 'p2', name: 'Marketing Website', href: '/projects/MKT', avatarUrl: null },
    ]
  }

  it('lists the pinned projects first, in their order, then yours', () => {
    pinned()
    open()
    expect(hrefs(screen.getByRole('region', { name: 'Pinned' }))).toEqual(['/projects/HR', '/projects/MKT'])
    expect(hrefs(screen.getByRole('region', { name: 'Projects' }))).toEqual(['/projects/WEB'])
    expect(screen.getByRole('heading', { name: 'Your projects' })).toBeTruthy()
  })

  it('gives each card its pin, saying what pinning does, pressed on the pinned ones', () => {
    pinned()
    open()
    const pins = screen.getAllByRole('button', { name: /^(Pin|Unpin):/ })
    expect(pins.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false'])
    expect(pins[2].getAttribute('aria-label')).toBe('Pin: shows it on Home and in the chat bar')
  })

  it('has no Pinned group when nothing is pinned', () => {
    open()
    expect(screen.queryByRole('region', { name: 'Pinned' })).toBeNull()
  })

  it('Edit moves a pinned project earlier or later, the other pins keeping their places', () => {
    pinned()
    open()
    const region = within(screen.getByRole('region', { name: 'Pinned' }))
    fireEvent.click(region.getByRole('button', { name: 'Edit' }))
    expect((region.getByRole('button', { name: 'Move HR policies earlier' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(region.getByRole('button', { name: 'Move HR policies later' }))
    expect(reorder).toHaveBeenCalledWith({ pinIds: ['xb', 'x2', 'x3'] })
  })
})

describe('the no-match line @SC-158', () => {
  it('names the search, and never speaks of filters', () => {
    open()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'intra' } })
    expect(screen.getByText('No project matches “intra”')).toBeTruthy()
    expect(screen.queryByText(/filters/)).toBeNull()
  })
})

describe('Your personal projects @SC-1061', () => {
  it('groups them apart, marked Only you, and leaves Your space to its own entry', () => {
    data.value.getProjects = [
      project('p1', 'WEB', 'Website Redesign'),
      project('p5', 'TAX', 'Tax return 2026', { personalOwnerId: 'u1', personalSpace: false }),
      project('p6', 'MY', 'My tasks', { personalOwnerId: 'u1', personalSpace: true }),
    ]
    open()
    const group = within(screen.getByRole('region', { name: 'Your personal projects' }))
    expect(group.getAllByText('Tax return 2026').length).toBeGreaterThan(0)
    expect(group.getByText('Only you')).toBeTruthy()
    expect(screen.queryByText('My tasks')).toBeNull()
  })
})
