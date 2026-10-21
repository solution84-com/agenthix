import { describe, it, expect } from 'vitest'
import type { BoardAcrossProjects } from '../../boardsAcrossProjects'
import { boardAddress, workspaceAddress, placePath } from '../../placeAddresses'
import { visibleBoards, visibleRoutines, visibleWorkspaces, type WorkspaceRowData } from '../acrossLists'
import { screenOf } from '../projectsScreenUrl'

const board = (id: string, name: string, project: { key: string; name: string; isPersonal?: boolean }, archivedAt: Date | null = null) => ({
  id, name, archivedAt, project: { id: `p-${project.key}`, name: project.name, key: project.key, isPersonal: !!project.isPersonal },
}) as unknown as BoardAcrossProjects

const boards = [
  board('b1', 'Project Tasks', { key: 'WEB', name: 'Website Redesign' }),
  board('b2', 'Launch plan', { key: 'MKT', name: 'Marketing Website' }),
  board('b3', 'Old', { key: 'WEB', name: 'Website Redesign' }, new Date()),
  board('b4', 'Mine', { key: 'MYT', name: 'My tasks', isPersonal: true }),
]

describe('the Boards view’s rows @SC-655', () => {
  it('shows the active boards, and the archived ones behind Archived', () => {
    expect(visibleBoards(boards, { archived: false, project: null, search: '' }).map(b => b.id)).toEqual(['b1', 'b2', 'b4'])
    expect(visibleBoards(boards, { archived: true, project: null, search: '' }).map(b => b.id)).toEqual(['b3'])
  })

  it('narrows to one project, and calls a person’s own project Chat', () => {
    expect(visibleBoards(boards, { archived: false, project: 'WEB', search: '' }).map(b => b.id)).toEqual(['b1'])
    expect(visibleBoards(boards, { archived: false, project: 'chat', search: '' }).map(b => b.id)).toEqual(['b4'])
  })

  it('searches a board’s name and its project’s', () => {
    expect(visibleBoards(boards, { archived: false, project: null, search: 'launch' }).map(b => b.id)).toEqual(['b2'])
    expect(visibleBoards(boards, { archived: false, project: null, search: 'marketing' }).map(b => b.id)).toEqual(['b2'])
  })
})

const ws = (id: string, name: string, key: string | null, placeName: string, repoUrl: string | null = null): WorkspaceRowData => ({
  id, name, repoUrl, siteLabel: 'HQ', previewRunning: false, place: { ownerType: key ? 'project' : 'user', ownerId: `o-${id}`, key, name: placeName },
})

describe('the Workspaces view’s rows @SC-657', () => {
  const rows = [ws('w1', 'website', 'WEB', 'Website Redesign', 'https://github.com/acme/website'), ws('w2', 'scratch', null, 'Chat')]

  it('filters by place, Chat included', () => {
    expect(visibleWorkspaces(rows, { place: 'WEB', search: '' }).map(w => w.id)).toEqual(['w1'])
    expect(visibleWorkspaces(rows, { place: 'chat', search: '' }).map(w => w.id)).toEqual(['w2'])
  })

  it('searches the name, the place and the repository', () => {
    expect(visibleWorkspaces(rows, { place: null, search: 'acme' }).map(w => w.id)).toEqual(['w1'])
    expect(visibleWorkspaces(rows, { place: null, search: 'chat' }).map(w => w.id)).toEqual(['w2'])
  })
})

describe('the addresses @SC-654', () => {
  it('open a board and a workspace in their place’s tool', () => {
    expect(boardAddress({ key: 'WEB' }, 'b1')).toBe('/projects/WEB?tool=boards&board=b1')
    expect(workspaceAddress({ key: 'WEB' }, 'w1')).toBe('/projects/WEB?tool=workspaces&workspace=w1')
    expect(workspaceAddress({ key: null }, 'w2')).toBe('/chat?tool=workspaces&workspace=w2')
    expect(placePath({ key: null })).toBe('/chat')
  })

  it('carry the view and its filters in the Projects address', () => {
    expect(screenOf(new URLSearchParams(''))).toMatchObject({ view: 'projects', project: null, archived: false, creating: null })
    expect(screenOf(new URLSearchParams('view=boards&project=WEB&archived=1'))).toMatchObject({ view: 'boards', project: 'WEB', archived: true })
    expect(screenOf(new URLSearchParams('view=workspaces&place=chat'))).toMatchObject({ view: 'workspaces', place: 'chat' })
    expect(screenOf(new URLSearchParams('view=nonsense&new=board&into=WEB'))).toMatchObject({ view: 'projects', creating: 'board', into: 'WEB' })
  })
})

describe('the Routines view’s rows @SC-688', () => {
  const routine = (id: string, title: string, enabled: boolean, project: { key: string | null; name: string }) => ({ id, title, enabled, project })
  const routines = [
    routine('r1', 'Daily site audit', true, { key: 'WEB', name: 'Website Redesign' }),
    routine('r2', 'Clean up old branches', false, { key: 'WEB', name: 'Website Redesign' }),
    routine('r3', 'Social posts', true, { key: 'MKT', name: 'Marketing Website' }),
    routine('r4', 'Summarise my week', true, { key: null, name: 'Chat' }),
  ]
  const ids = (opts: Partial<Parameters<typeof visibleRoutines>[1]>) =>
    visibleRoutines(routines, { place: null, state: null, search: '', ...opts }).map(r => r.id)

  it('filters by place — a project, or Chat — and by On or Paused', () => {
    expect(ids({ place: 'WEB' })).toEqual(['r1', 'r2'])
    expect(ids({ place: 'chat' })).toEqual(['r4'])
    expect(ids({ state: 'paused' })).toEqual(['r2'])
    expect(ids({ state: 'on', place: 'WEB' })).toEqual(['r1'])
  })

  it('searches the routine and its place', () => {
    expect(ids({ search: 'marketing' })).toEqual(['r3'])
    expect(ids({ search: 'WEEK' })).toEqual(['r4'])
  })

  it('carries the view, its filters and New routine… in the address', () => {
    expect(screenOf(new URLSearchParams('view=routines&place=chat&state=paused'))).toMatchObject({ view: 'routines', place: 'chat', state: 'paused' })
    expect(screenOf(new URLSearchParams('view=routines&new=routine&into=WEB'))).toMatchObject({ creating: 'routine', into: 'WEB' })
    expect(screenOf(new URLSearchParams('state=sometimes')).state).toBeNull()
  })
})
