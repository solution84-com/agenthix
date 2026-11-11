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
  getProjects: 'getProjects', getExecutionSites: 'getExecutionSites', getBoardViewsAcrossProjects: 'getBoardViewsAcrossProjects',
  getWorkspacesAcrossPlaces: 'getWorkspacesAcrossPlaces', getRoutinesAcrossProjects: 'getRoutinesAcrossProjects',
  updateRoutine: 'updateRoutine', runRoutineNow: 'runRoutineNow', deleteRoutine: 'deleteRoutine', reorderRoutines: 'reorderRoutines', getRoutineRunFacts: 'getRoutineRunFacts',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'Avery' } } } }) }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, action, title, subtitle, phoneActions }: { children: React.ReactNode; action: React.ReactNode; title: string; subtitle: string; phoneActions?: { label: string }[] }) => (
    <div><h1>{title}</h1><p>{subtitle}</p>{action}<ul aria-label="Phone actions">{phoneActions?.map(a => <li key={a.label}>{a.label}</li>)}</ul>{children}</div>
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
const spread = [{ key: 'BACKLOG', name: 'Backlog', count: 1, state: 'BACKLOG' }, { key: 'TODO', name: 'To do', count: 2, state: 'TODO' }]
const entry = (key: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: key, key, name, builtIn: false, kind: 'TYPE', typeId: 't', fieldId: null, typeName: 'Bug', fieldName: null, filter: {},
  spread, needsYouCount: 0, lastMovedAt: null, ...extra,
})
const builtIn = (extra: Record<string, unknown> = {}) => entry('state', 'Task state', { id: null, builtIn: true, kind: 'STATE', typeId: null, typeName: null, ...extra })
const group = (key: string, name: string, boards: unknown[]) => ({ project: { id: `p-${key}`, name, key, isPersonal: false }, boards })
const routine = (id: string, title: string, project: { id: string; key: string | null; name: string }, extra: Record<string, unknown> = {}) => ({
  id, title, project, projectId: project.id, cron: '0 9 * * 1-5', timezone: 'UTC', scheduleWords: 'At 09:00, Monday to Friday, UTC',
  enabled: true, pausedReason: null, nextDueAt: '2026-10-12T09:00:00.000Z', onBehalfOf: { userId: 'u1', username: 'Avery' },
  agent: { id: 'a1', name: 'Frontend dev' }, modelChoice: null, canChange: true, lastRuns: [], ...extra,
})

beforeEach(() => {
  data.value = {
    getProjects: [project('p1', 'WEB', 'Website Redesign'), project('p2', 'MKT', 'Marketing Website', { myRole: 'VIEWER' })],
    getExecutionSites: [],
    getBoardViewsAcrossProjects: [
      group('MKT', 'Marketing Website', [builtIn(), entry('b2', 'Launch')]),
      group('WEB', 'Website Redesign', [builtIn({ needsYouCount: 2 }), entry('b3', 'Launch plan')]),
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
      routine('r1', 'Daily site audit', { id: 'p1', key: 'WEB', name: 'Website Redesign' }),
      routine('r2', 'Clean up old branches', { id: 'p1', key: 'WEB', name: 'Website Redesign' }, { enabled: false, nextDueAt: null }),
      routine('r3', 'Summarise my week', { id: 'p9', key: null, name: 'Chat' }),
    ],
  }
})
afterEach(cleanup)

describe('Boards @SC-655', () => {
  it('is its own page, with its title and New board', () => {
    open('/boards')
    expect(screen.getByRole('heading', { name: 'Boards' })).toBeTruthy()
    expect(screen.getByText("Every board in your projects: each a way of looking at its project's tasks")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New board' }))
    expect(where()).toBe('/boards?new=board')
    // Only the projects where the person may add a board.
    expect(screen.getByText('new board: Website Redesign')).toBeTruthy()
  })

  it('groups the boards by project, the built-in ones first, each opening in its project', () => {
    open('/boards')
    const rows = screen.getAllByRole('link')
    expect(rows.map(r => r.getAttribute('href'))).toEqual([
      '/projects/MKT?tool=boards&board=state', '/projects/MKT?tool=boards&board=b2',
      '/projects/WEB?tool=boards&board=state', '/projects/WEB?tool=boards&board=b3',
    ])
    expect(rows[2].textContent).toContain('Task state')
    expect(rows[2].textContent).toContain('Built in')
    expect(rows[2].textContent).toContain('2 need you')
    expect(rows[3].textContent).toContain('Launch plan')
    expect(rows[3].textContent).toContain("Bug's columns")
    expect(rows[3].textContent).toContain('Backlog 1 · To do 2')
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
    expect(screen.getByRole('alert').textContent).toContain("1 site isn't answering")
  })

  it('New workspace offers the places where the person may add one, Chat included', () => {
    open('/workspaces')
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    expect(screen.getByText('new workspace: Chat, Website Redesign')).toBeTruthy()
  })
})

describe('Routines @SC-688', () => {
  it('lists each project\'s routines as cards under its name, each opening in its project\'s Routines', () => {
    open('/routines')
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy()
    expect(screen.getByText('Runs that repeat, in every project you are in')).toBeTruthy()
    const group = within(screen.getByRole('region', { name: 'Website Redesign' }))
    const link = group.getByRole('link', { name: 'Daily site audit' })
    expect(link.getAttribute('href')).toBe('/projects/WEB?tool=routines&routine=r1')
    expect(group.getByRole('article', { name: 'Daily site audit' }).textContent).toContain('At 09:00, Monday to Friday, UTC')
    expect(group.getByRole('article', { name: 'Daily site audit' }).textContent).toContain('Frontend dev · on behalf of Avery (you)')
  })

  it('leaves the person\'s own space\'s routines to Your space', () => {
    open('/routines')
    expect(screen.queryByRole('article', { name: 'Summarise my week' })).toBeNull()
  })

  it('counts the routines that are on, and filters by the count chosen', () => {
    open('/routines')
    const counts = within(screen.getByRole('group', { name: 'Routines at a glance' }))
    fireEvent.click(counts.getByRole('button', { name: /Routines on/ }))
    expect(screen.queryByRole('article', { name: 'Clean up old branches' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Daily site audit' })).toBeTruthy()
  })

  it('on a phone, New routine is the first of the top bar’s ⋯, not only a button in the content', () => {
    open('/routines')
    expect(within(screen.getByRole('list', { name: 'Phone actions' })).getAllByRole('listitem').map(i => i.textContent)).toEqual(['New routine'])
  })

  it('has a project filter beside the search, even while every routine is in one project', () => {
    open('/routines')
    expect(screen.getByRole('combobox', { name: 'Project' })).toBeTruthy()
  })

  it('New routine asks for a place where the person works first', () => {
    open('/routines')
    fireEvent.click(screen.getByRole('button', { name: 'New routine' }))
    expect(where()).toBe('/routines?new=routine')
    expect(screen.getByText('new routine: Website Redesign')).toBeTruthy()
  })
})
