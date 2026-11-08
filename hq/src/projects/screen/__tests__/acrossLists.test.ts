import { describe, it, expect } from 'vitest'
import type { ProjectBoards } from '../../boardViewsAcrossProjects'
import type { BoardListEntry } from '../../boardListService'
import { boardAddress, workspaceAddress, placePath } from '../../placeAddresses'
import { visibleBoards, visibleRoutines, visibleWorkspaces, type WorkspaceRowData } from '../acrossLists'
import { screenOf } from '../acrossListUrl'

const entry = (key: string, name: string, builtIn = false) => ({ key, id: builtIn ? null : key, name, builtIn }) as unknown as BoardListEntry
const group = (key: string, name: string, boards: BoardListEntry[], isPersonal = false): ProjectBoards => ({
  project: { id: `p-${key}`, name, key, isPersonal }, boards,
})

const groups = [
  group('WEB', 'Website Redesign', [entry('state', 'Task state', true), entry('b1', 'Bugs')]),
  group('MKT', 'Marketing Website', [entry('state', 'Task state', true), entry('b2', 'Launch plan')]),
  group('MYT', 'My tasks', [entry('b4', 'Mine')], true),
]
const keys = (shown: ProjectBoards[]) => shown.map(g => `${g.project.key}:${g.boards.map(b => b.key).join(',')}`)

describe('the Boards page’s rows @SC-655', () => {
  it('keeps every project’s boards in its group, in the projects’ order', () => {
    expect(keys(visibleBoards(groups, { project: null, search: '' }))).toEqual(['WEB:state,b1', 'MKT:state,b2', 'MYT:b4'])
  })

  it('narrows to one project, and calls a person’s own project Chat', () => {
    expect(keys(visibleBoards(groups, { project: 'WEB', search: '' }))).toEqual(['WEB:state,b1'])
    expect(keys(visibleBoards(groups, { project: 'chat', search: '' }))).toEqual(['MYT:b4'])
  })

  it('searches a board’s name and its project’s, leaving out a project with nothing that matches', () => {
    expect(keys(visibleBoards(groups, { project: null, search: 'launch' }))).toEqual(['MKT:b2'])
    expect(keys(visibleBoards(groups, { project: null, search: 'marketing' }))).toEqual(['MKT:state,b2'])
  })
})

const ws = (id: string, name: string, key: string | null, placeName: string, repoUrl: string | null = null): WorkspaceRowData => ({
  id, name, repoUrl, siteLabel: 'HQ', previewRunning: false, place: { ownerType: key ? 'project' : 'user', ownerId: `o-${id}`, key, name: placeName },
})

describe('the Workspaces page’s rows @SC-657', () => {
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

  it('carry the filters and what is being made in the list’s address', () => {
    expect(screenOf(new URLSearchParams(''))).toMatchObject({ project: null, archived: false, creating: null })
    expect(screenOf(new URLSearchParams('project=WEB&archived=1'))).toMatchObject({ project: 'WEB', archived: true })
    expect(screenOf(new URLSearchParams('place=chat'))).toMatchObject({ place: 'chat' })
    expect(screenOf(new URLSearchParams('new=board&into=WEB'))).toMatchObject({ creating: 'board', into: 'WEB' })
    expect(screenOf(new URLSearchParams('new=nonsense')).creating).toBeNull()
  })
})

describe('the Routines page’s rows @SC-688', () => {
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

  it('carries its filters and New routine in the address', () => {
    expect(screenOf(new URLSearchParams('place=chat&state=paused'))).toMatchObject({ place: 'chat', state: 'paused' })
    expect(screenOf(new URLSearchParams('new=routine&into=WEB'))).toMatchObject({ creating: 'routine', into: 'WEB' })
    expect(screenOf(new URLSearchParams('state=sometimes')).state).toBeNull()
  })
})
