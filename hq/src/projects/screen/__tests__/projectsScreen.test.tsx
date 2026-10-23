// @vitest-environment jsdom
/** The Projects screen's four views, the card's boards link and the split button (every screen reviewed spec §3). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

// The ui package resolves its own copy of lucide-react (and React), which cannot render here: its icons are blanked.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { Search: icon, ChevronDown: icon, X: icon, Plus: icon, MoreHorizontal: icon }
})

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({ data: data.value[q], isLoading: false }),
  useAction: () => vi.fn(),
  createProject: 'createProject', createPersonalProject: 'createPersonalProject', getUserSettings: 'getUserSettings', getProjects: 'getProjects', getProducts: 'getProducts', getPrograms: 'getPrograms',
  getExecutionSites: 'getExecutionSites', getProjectCards: 'getProjectCards', getAllBoards: 'getAllBoards',
  getWorkspacesAcrossPlaces: 'getWorkspacesAcrossPlaces', getRoutinesAcrossProjects: 'getRoutinesAcrossProjects',
  pauseRoutine: 'pauseRoutine', resumeRoutine: 'resumeRoutine',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, action }: { children: React.ReactNode; action: React.ReactNode }) => <div>{action}{children}</div>,
}))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))
vi.mock('../NewIntoPlace', () => ({ NewIntoPlace: ({ what, places }: { what: string; places: { name: string }[] }) => <div>new {what}: {places.map(p => p.name).join(', ')}</div> }))
vi.mock('@agenthix/ui/projects', async (importOriginal) => ({ ...(await importOriginal<object>()), CreateProjectModal: () => null }))

import { ProjectsPage } from '../../pages/ProjectsPage'

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><ProjectsPage /><Where /></MemoryRouter>)
const where = () => screen.getByTestId('where').textContent

const project = (id: string, key: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, key, name, description: null, productId: null, programId: null, executionSiteId: 's1', personalOwnerId: null,
  isMember: true, myRole: 'MEMBER', boards: [{ id: 'x' }, { id: 'y' }], tasks: [], ...extra,
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
    getProducts: [], getPrograms: [], getExecutionSites: [], getProjectCards: { cards: [] },
    getAllBoards: [board('b1', 'Project Tasks', 'WEB', 'Website Redesign', { needsYouCount: 2 }), board('b2', 'Launch', 'MKT', 'Marketing Website')],
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

describe('the views @SC-654', () => {
  it('opens on the project cards, with the four views under the header', () => {
    open('/projects')
    const views = within(screen.getByRole('navigation', { name: 'Views' }))
    expect(views.getAllByRole('button').map(b => b.textContent)).toEqual(['Projects', 'Boards', 'Workspaces', 'Routines'])
    expect(views.getByRole('button', { name: 'Projects' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByText('Website Redesign').length).toBeGreaterThan(0)
  })

  it('puts the view in the address, and takes the filters off when it changes', () => {
    open('/projects?view=boards&project=WEB')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Workspaces' }))
    expect(where()).toBe('/projects?view=workspaces')
  })

  it('a card’s "N boards" opens the Boards view filtered to that project, without opening the card @SC-656', () => {
    open('/projects')
    fireEvent.click(screen.getAllByRole('link', { name: '2 boards' })[0])
    expect(where()).toBe('/projects?view=boards&project=WEB')
  })
})

describe('the Boards view @SC-655', () => {
  it('lists each board with its project and "N needs you", linking into the project’s Boards tool', () => {
    open('/projects?view=boards')
    const row = screen.getByRole('link', { name: /Project Tasks/ })
    expect(row.getAttribute('href')).toBe('/projects/WEB?tool=boards&board=b1')
    expect(row.textContent).toContain('2 need you')
    expect(row.textContent).toContain('Website Redesign')
  })

  it('shows one project’s boards when filtered', () => {
    open('/projects?view=boards&project=MKT')
    expect(screen.queryByRole('link', { name: /Project Tasks/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Launch/ })).toBeTruthy()
  })
})

describe('the Workspaces view @SC-657', () => {
  it('lists each workspace with its place, repository, preview and site, opening in its place’s tool', () => {
    open('/projects?view=workspaces')
    const row = screen.getByRole('link', { name: /website/ })
    expect(row.getAttribute('href')).toBe('/projects/WEB?tool=workspaces&workspace=w1')
    expect(row.textContent).toContain('acme/website')
    expect(row.textContent).toContain('Preview running')
    expect(screen.getByRole('link', { name: /scratch/ }).getAttribute('href')).toBe('/chat?tool=workspaces&workspace=w2')
  })

  it('says in one quiet line that a site does not answer', () => {
    open('/projects?view=workspaces')
    expect(screen.getByRole('status').textContent).toContain("1 site isn't answering")
  })
})

describe('the Routines view @SC-688', () => {
  it('lists each routine with its place, repeat, person and last rounds, opening inside its place’s Automation tool', () => {
    open('/projects?view=routines')
    const row = screen.getByRole('link', { name: /Daily site audit/ })
    expect(row.getAttribute('href')).toBe('/projects/WEB?tool=automation&routine=r1')
    expect(row.textContent).toContain('Website Redesign')
    expect(row.textContent).toContain('Every weekday at 9:00')
    expect(within(row).getByRole('img').getAttribute('aria-label')).toBe('Last 3: 1 done · 1 failed · 1 waiting')
    expect(screen.getByRole('link', { name: /Summarise my week/ }).getAttribute('href')).toBe('/chat?tool=automation&routine=r3')
    expect(screen.getByRole('switch', { name: 'Daily site audit on' }).getAttribute('aria-checked')).toBe('true')
  })

  it('filters to the paused ones, and to one place, from the address', () => {
    open('/projects?view=routines&state=paused')
    expect(screen.queryByRole('link', { name: /Daily site audit/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Clean up old branches/ }).textContent).toContain('Paused')
    cleanup()
    open('/projects?view=routines&place=chat')
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual([expect.stringContaining('Summarise my week')])
  })
})

describe('＋ New project ▾ @SC-658', () => {
  it('is on every view, and its arrow offers a board and a workspace', () => {
    open('/projects?view=boards')
    expect(screen.getByRole('button', { name: /New project/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More ways to add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New board…/ }))
    expect(where()).toBe('/projects?view=boards&new=board')
  })

  it('offers a board only the projects where the person may add one', () => {
    open('/projects?new=board')
    expect(screen.getByText('new board: Website Redesign')).toBeTruthy()
  })

  it('offers New routine… too, which asks for a place where the person works first', () => {
    open('/projects?view=routines')
    fireEvent.click(screen.getByRole('button', { name: 'More ways to add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New routine…/ }))
    expect(where()).toBe('/projects?view=routines&new=routine')
    expect(screen.getByText('new routine: Website Redesign')).toBeTruthy()
  })

  it('offers a workspace the places where the person may add one, Chat included', () => {
    open('/projects?new=workspace')
    expect(screen.getByText('new workspace: Chat, Website Redesign')).toBeTruthy()
  })
})

describe('Your personal projects @SC-1061', () => {
  it('groups them apart, marked Only you, and leaves Your space to its own entry', () => {
    data.value.getProjects = [
      project('p1', 'WEB', 'Website Redesign'),
      project('p5', 'TAX', 'Tax return 2026', { personalOwnerId: 'u1', personalSpace: false }),
      project('p6', 'MY', 'My tasks', { personalOwnerId: 'u1', personalSpace: true }),
    ]
    open('/projects')
    expect(screen.getByRole('heading', { name: 'Your personal projects' })).toBeTruthy()
    const group = within(screen.getByRole('region', { name: 'Your personal projects' }))
    expect(group.getAllByText('Tax return 2026').length).toBeGreaterThan(0)
    expect(group.getByText('Only you')).toBeTruthy()
    expect(screen.queryByText('My tasks')).toBeNull()
    expect(screen.getAllByText('Website Redesign').length).toBeGreaterThan(0)
  })
})
