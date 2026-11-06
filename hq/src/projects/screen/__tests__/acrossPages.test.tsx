// @vitest-environment jsdom
/** Boards, Workspaces and Routines: rail places of their own, each with its title and its one New button. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, X: icon, Plus: icon, MoreHorizontal: icon }
})

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({ data: data.value[q], isLoading: false }),
  useAction: () => vi.fn(),
  getProjects: 'getProjects', getExecutionSites: 'getExecutionSites', getAllBoards: 'getAllBoards',
  getWorkspacesAcrossPlaces: 'getWorkspacesAcrossPlaces', getRoutinesAcrossProjects: 'getRoutinesAcrossProjects',
  pauseRoutine: 'pauseRoutine', resumeRoutine: 'resumeRoutine',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, action, title, subtitle }: { children: React.ReactNode; action: React.ReactNode; title: string; subtitle: string }) => (
    <div><h1>{title}</h1><p>{subtitle}</p>{action}{children}</div>
  ),
}))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))
vi.mock('../NewIntoPlace', () => ({ NewIntoPlace: ({ what, places }: { what: string; places: { name: string }[] }) => <div>new {what}: {places.map(p => p.name).join(', ')}</div> }))

import { BoardsPage } from '../../pages/BoardsPage'
import { WorkspacesListPage } from '../../pages/WorkspacesListPage'
import { RoutinesPage } from '../../pages/RoutinesPage'

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const PAGES = { '/boards': BoardsPage, '/workspaces': WorkspacesListPage, '/routines': RoutinesPage } as const
const open = (path: string) => {
  const Page = PAGES[path.split('?')[0] as keyof typeof PAGES]
  return render(<MemoryRouter initialEntries={[path]}><Page /><Where /></MemoryRouter>)
}
const where = () => screen.getByTestId('where').textContent

const project = (id: string, key: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, key, name, description: null, productId: null, programId: null, executionSiteId: 's1', personalOwnerId: null,
  isMember: true, myRole: 'MEMBER', ...extra,
})
const column = (name: string, status: string, count: number) => ({ name, label: name, status, order: 0, count })
const board = (id: string, name: string, projectKey: string, projectName: string, extra: Record<string, unknown> = {}) => ({
  id, name, kind: 'WORKFLOW', archivedAt: null, columns: [column('todo', 'TODO', 2)], backlogCount: 1, needsYouCount: 0, currentSprint: null,
  project: { id: `p-${projectKey}`, name: projectName, key: projectKey, isPersonal: false }, ...extra,
})
const routine = (id: string, title: string, project: { id: string; key: string | null; name: string }, extra: Record<string, unknown> = {}) => ({
  id, title, project, rule: { kind: 'weekly', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, timezone: 'UTC', enabled: true, pausedReason: null,
  nextRoundAt: '2026-10-12T09:00:00.000Z', onBehalfOf: { userId: 'u1', username: 'Avery' }, agentName: 'Frontend dev',
  place: 'Release board › To do', canManage: true, lastRounds: [], ...extra,
})

beforeEach(() => {
  data.value = {
    getProjects: [project('p1', 'WEB', 'Website Redesign'), project('p2', 'MKT', 'Marketing Website', { myRole: 'VIEWER' })],
    getExecutionSites: [],
    getAllBoards: [
      board('b2', 'Launch', 'MKT', 'Marketing Website'),
      board('b1', 'Project Tasks', 'WEB', 'Website Redesign', { kind: 'PROJECT_TASKS', needsYouCount: 2 }),
      board('b3', 'Launch plan', 'WEB', 'Website Redesign'),
      board('b4', 'Project Tasks', 'MKT', 'Marketing Website', { kind: 'PROJECT_TASKS' }),
    ],
    getWorkspacesAcrossPlaces: {
      workspaces: [
        { id: 'w1', name: 'website', repoUrl: 'https://github.com/acme/website', siteLabel: 'HQ', previewRunning: true, place: { ownerType: 'project', ownerId: 'p1', key: 'WEB', name: 'Website Redesign' } },
        { id: 'w2', name: 'scratch', repoUrl: null, siteLabel: 'HQ', previewRunning: false, place: { ownerType: 'user', ownerId: 'u1', key: null, name: 'Chat' } },
      ],
      places: [{ ownerType: 'user', ownerId: 'u1', key: null, name: 'Chat', mayAdd: true }, { ownerType: 'project', ownerId: 'p1', key: 'WEB', name: 'Website Redesign', mayAdd: true }],
      unanswered: [{ siteId: 's9', label: 'Build server', reason: 'offline', detail: '' }],
    },
    getRoutinesAcrossProjects: [
      routine('r1', 'Daily site audit', { id: 'p1', key: 'WEB', name: 'Website Redesign' }, { lastRounds: ['done', 'failed', 'waiting'] }),
      routine('r2', 'Clean up old branches', { id: 'p1', key: 'WEB', name: 'Website Redesign' }, { enabled: false, nextRoundAt: null }),
      routine('r3', 'Summarise my week', { id: 'p9', key: null, name: 'Chat' }),
    ],
  }
})
afterEach(cleanup)

describe('Boards @SC-655', () => {
  it('is its own page, with its title and New board', () => {
    open('/boards')
    expect(screen.getByRole('heading', { name: 'Boards' })).toBeTruthy()
    expect(screen.getByText('Every board you can see, in every project')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New board' }))
    expect(where()).toBe('/boards?new=board')
    // Only the projects where the person may add a board.
    expect(screen.getByText('new board: Website Redesign')).toBeTruthy()
  })

  it('leads a default board with its project, says what it is, and groups the boards by project', () => {
    open('/boards')
    const rows = screen.getAllByRole('link')
    expect(rows.map(r => r.getAttribute('href'))).toEqual([
      '/projects/MKT?tool=boards&board=b4', '/projects/MKT?tool=boards&board=b2',
      '/projects/WEB?tool=boards&board=b1', '/projects/WEB?tool=boards&board=b3',
    ])
    const tasks = rows[2]
    expect(tasks.textContent).toContain('Website Redesign')
    expect(tasks.textContent).toContain("Tasks · the project's default board")
    expect(tasks.textContent).toContain('2 need you')
    expect(tasks.textContent).not.toContain('Project Tasks')
    expect(rows[3].textContent).toContain('Launch plan')
  })

  it('shows one project’s boards when filtered', () => {
    open('/boards?project=MKT')
    expect(screen.getAllByRole('link').every(l => l.getAttribute('href')?.startsWith('/projects/MKT'))).toBe(true)
  })
})

describe('Workspaces @SC-657', () => {
  it('lists each workspace with its project or Chat, repository, preview and site, opening in its place’s tool', () => {
    open('/workspaces')
    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    const row = screen.getByRole('link', { name: /website/ })
    expect(row.getAttribute('href')).toBe('/projects/WEB?tool=workspaces&workspace=w1')
    expect(row.textContent).toContain('Preview running')
    expect(screen.getByRole('link', { name: /scratch/ }).getAttribute('href')).toBe('/chat?tool=workspaces&workspace=w2')
    expect(screen.getByRole('combobox', { name: 'Project or Chat' })).toBeTruthy()
    expect(screen.queryByText(/All places|^Place$/)).toBeNull()
  })

  it('says in one quiet line that a site does not answer', () => {
    open('/workspaces')
    expect(screen.getByRole('status').textContent).toContain("1 site isn't answering")
  })

  it('New workspace offers the places where the person may add one, Chat included', () => {
    open('/workspaces')
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    expect(screen.getByText('new workspace: Chat, Website Redesign')).toBeTruthy()
  })
})

describe('Routines @SC-688', () => {
  it('lists each routine with its place, repeat, person and last rounds, opening inside its place’s Automation tool', () => {
    open('/routines')
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy()
    const row = screen.getByRole('link', { name: /Daily site audit/ })
    expect(row.getAttribute('href')).toBe('/projects/WEB?tool=automation&routine=r1')
    expect(row.textContent).toContain('Every weekday at 9:00')
    expect(within(row).getByRole('img').getAttribute('aria-label')).toBe('Last 3: 1 done · 1 failed · 1 waiting')
    expect(screen.getByText('Last 10')).toBeTruthy()
  })

  it('draws no Last 10 until a routine has run', () => {
    data.value.getRoutinesAcrossProjects = [routine('r3', 'Summarise my week', { id: 'p9', key: null, name: 'Chat' })]
    open('/routines')
    expect(screen.queryByText('Last 10')).toBeNull()
  })

  it('filters All · On · Paused, from the address', () => {
    open('/routines?state=paused')
    const group = within(screen.getByRole('group', { name: 'On or paused' }))
    expect(group.getAllByRole('button').map(b => b.textContent)).toEqual(['All', 'On', 'Paused'])
    expect(group.getByRole('button', { name: 'Paused' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('link', { name: /Daily site audit/ })).toBeNull()
    fireEvent.click(group.getByRole('button', { name: 'All' }))
    expect(where()).toBe('/routines')
    expect(screen.getByRole('link', { name: /Daily site audit/ })).toBeTruthy()
  })

  it('New routine asks for a place where the person works first', () => {
    open('/routines')
    fireEvent.click(screen.getByRole('button', { name: 'New routine' }))
    expect(where()).toBe('/routines?new=routine')
    expect(screen.getByText('new routine: Website Redesign')).toBeTruthy()
  })
})
