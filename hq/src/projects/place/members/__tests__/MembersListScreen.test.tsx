// @vitest-environment jsdom
/**
 * A project's Members as one list: people, agents and teams in one row shape, each role saying where it comes from;
 * filters, a team row narrowing the list, greyed changes on someone a team brings, and one Add members dialog.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/agents')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Bot: icon, Check: icon, X: icon, ChevronRight: icon }
})

const idle = { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null }
const studio = { id: 't1', name: 'Studio', role: 'MEMBER' }
const at = new Date('2026-11-01')
const person = (id: string, name: string, extra: object = {}) => ({
  kind: 'person', id, name, handle: name.toLowerCase().split(' ')[0], avatarUrl: null, role: 'MEMBER', ownRole: 'MEMBER', teams: [],
  isLead: false, isMe: false, addedAt: at, lastActiveAt: null, now: idle, ...extra,
})
const state = vi.hoisted(() => ({ manage: true, agents: 2, lastArgs: {} as Record<string, unknown>, actions: {} as Record<string, ReturnType<typeof vi.fn>> }))

function memberList() {
  const rows = [
    person('u1', 'Dana Fox', { ownRole: null, teams: [studio] }),
    person('u2', 'Priya Nair', { role: 'ADMIN', ownRole: 'ADMIN', teams: [studio], isLead: true }),
    person('u3', 'Sam Okafor', { role: 'ADMIN', ownRole: 'ADMIN', isMe: true }),
    ...(state.agents ? [
      { kind: 'agent', id: 'a1', name: 'Writer', handle: 'writer', description: 'Drafts and edits copy', avatarUrl: null, isDefault: true, direct: false, teams: [studio], addedAt: at, lastActiveAt: null, now: idle },
      { kind: 'agent', id: 'a2', name: 'Reviewer', handle: 'reviewer', description: null, avatarUrl: null, isDefault: false, direct: true, teams: [], addedAt: at, lastActiveAt: null, now: idle },
    ] : []),
    { kind: 'team', id: 't1', name: 'Studio', avatarUrl: null, role: 'MEMBER', peopleCount: 2, agentCount: 1, addedBy: 'Sam Okafor', addedAt: at, lastActiveAt: null },
  ]
  return {
    project: { id: 'p1', key: 'WEB', name: 'Website relaunch', accessLevel: 'OPEN', personal: false },
    totals: { everyone: rows.length, people: 3, agents: state.agents, teams: 1 },
    counts: { everyone: rows.length, people: 3, agents: state.agents, teams: 1 },
    canManagePeople: state.manage, canAssignAgents: state.manage, total: 60, rows,
  }
}

const results: Record<string, () => unknown> = {
  getProjectMemberList: memberList,
  getTeams: () => [{ id: 't2', name: 'Operations', people: [{ userId: 'u9', name: 'Lee Park', handle: 'lee', avatarUrl: null }, { userId: 'u8', name: 'Ola Berg', handle: 'ola', avatarUrl: null }], agents: [{ id: 'a9', name: 'Invoice checker', handle: 'ic', avatarUrl: null }] }],
  getProjectTeams: () => ({ teams: [], people: [], agents: [] }),
  getProjectPeople: () => ({ people: [{ person: { userId: 'u9' }, role: 'ADMIN' }] }),
  listPeopleForProject: () => [
    { person: { userId: 'u7', name: 'Kai Tanaka', handle: 'kai', avatarUrl: null, state: 'active' }, orgRole: 'MEMBER', projectCount: 2, isMember: false },
    { person: { userId: 'u1', name: 'Dana Fox', handle: 'dana', avatarUrl: null, state: 'active' }, orgRole: 'MEMBER', projectCount: 1, isMember: true },
  ],
  getAgents: () => [],
}

vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string, args: Record<string, unknown>) => {
    if (query === 'getProjectMemberList') state.lastArgs = args
    return { data: results[query]?.(), isLoading: false, error: undefined, refetch: vi.fn() }
  },
  useAction: (action: string) => (state.actions[action] ??= vi.fn().mockResolvedValue({})),
  getProjectMemberList: 'getProjectMemberList', setProjectTeamRole: 'setProjectTeamRole', getTeams: 'getTeams',
  getProjectTeams: 'getProjectTeams', getProjectPeople: 'getProjectPeople', listPeopleForProject: 'listPeopleForProject',
  getAgents: 'getAgents', getUserSettings: 'getUserSettings', addProjectMember: 'addProjectMember', addAgentToProject: 'addAgentToProject', addTeamToProject: 'addTeamToProject',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u3' } }) }))
vi.mock('../../../../people/AuthedPersonAvatar', () => ({ personAvatarOf: (p: { name: string }) => <span>{p.name.slice(0, 1)}</span> }))
vi.mock('../../../agents/avatarOf', () => ({ avatarOf: (a: { name: string }) => <span>{a.name.slice(0, 1)}</span> }))
vi.mock('../../../../shared/components/AuthedImg', () => ({ AuthedImg: () => null }))

import { MembersListScreen } from '../MembersListScreen'
import type { MembersScreen } from '../useMembersUrl'

const urlOf = (screenNow: MembersScreen = { kind: 'list', adding: null }) => ({
  screen: screenNow,
  toList: vi.fn(), toAdd: vi.fn(), toRemoveTeam: vi.fn(), toPerson: vi.fn(), toRemovePerson: vi.fn(), toAgent: vi.fn(), toRemoveAgent: vi.fn(),
})
const show = (url = urlOf()) => { render(<MemoryRouter><MembersListScreen projectId="p1" url={url} /></MemoryRouter>); return url }
const rowOf = (name: string) => screen.getByRole('button', { name: `Open ${name}` }).closest('li') as HTMLElement

beforeEach(() => { state.manage = true; state.agents = 2; state.actions = {}; vi.clearAllMocks() })
afterEach(cleanup)

describe('Members, one list', () => {
  it('heads the list with its people, agents and teams, and filters with counts', () => {
    show()
    expect(screen.getByText('3 people · 2 agents · 1 team')).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBe(6)
    fireEvent.click(screen.getByRole('button', { name: 'Agents 2' }))
    expect(state.lastArgs).toMatchObject({ projectId: 'p1', filter: 'agents', sort: 'name' })
    fireEvent.click(screen.getByRole('button', { name: /Sort: Name/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Needs you first/ }))
    expect(state.lastArgs).toMatchObject({ sort: 'needs' })
  })

  it('says where each role comes from, and that agents are assigned', () => {
    show()
    expect(within(rowOf('Dana Fox')).getByText('through Studio')).toBeTruthy()
    expect(within(rowOf('Priya Nair')).getByText('direct member · also Member through Studio')).toBeTruthy()
    expect(within(rowOf('Sam Okafor')).getByText('direct member')).toBeTruthy()
    expect(within(rowOf('Writer')).getByText('Assigned')).toBeTruthy()
    expect(within(rowOf('Writer')).getByText('through Studio')).toBeTruthy()
    expect(within(rowOf('Writer')).getByText('Agent · default')).toBeTruthy()
    expect(screen.getByText('for its people')).toBeTruthy()
  })

  it('narrows the list to a team when its row is clicked, as a filter that clears', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Show who is in Studio' }))
    expect(state.lastArgs).toMatchObject({ teamId: 't1' })
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone, not only Studio' }))
    expect(state.lastArgs.teamId).toBeUndefined()
  })

  it('pages with Show more', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Show more · 54 more/ }))
    expect(state.lastArgs).toMatchObject({ limit: 100 })
  })
})

describe('someone here only through a team', () => {
  it('offers Make … a direct member, and greys Change role and Remove with what to do instead', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More about Dana Fox' }))
    const change = screen.getByRole('menuitem', { name: /Change role/ })
    expect(change).toHaveProperty('disabled', true)
    expect(change.getAttribute('title')).toBe("Dana is here through Studio as Member. Change the team's role, or take them out of the team.")
    expect(screen.getByRole('menuitem', { name: /Remove from this project/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('menuitem', { name: /Make Dana a direct member/ }))
    const dialog = screen.getByRole('dialog', { name: 'Make Dana Fox a direct member' })
    expect(within(dialog).getByRole('radio', { name: /Admin/ })).toHaveProperty('disabled', false)
    expect(within(dialog).getByRole('radio', { name: /Member/ })).toHaveProperty('disabled', true)
    expect(within(dialog).getByRole('radio', { name: /Viewer/ })).toHaveProperty('disabled', true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make direct member' }))
    expect(state.actions.addProjectMember).toHaveBeenCalledWith({ projectId: 'p1', userId: 'u1', role: 'ADMIN' })
  })

  it('lets someone here in their own right be changed and removed', () => {
    const url = show()
    fireEvent.click(screen.getByRole('button', { name: 'More about Priya Nair' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from this project/ }))
    expect(url.toRemovePerson).toHaveBeenCalledWith('u2')
  })
})

describe('Add members', () => {
  it('is one filled button opening the dialog', () => {
    const url = show()
    fireEvent.click(screen.getByRole('button', { name: 'Add members' }))
    expect(url.toAdd).toHaveBeenCalledWith('people')
  })

  it('adds people with the role chosen at the top, and says who is already here', async () => {
    show(urlOf({ kind: 'list', adding: 'people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to Website relaunch' })
    expect(within(dialog).getByText('Already here')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Viewer' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Kai Tanaka' }))
    await waitFor(() => expect(state.actions.addProjectMember).toHaveBeenCalledWith({ projectId: 'p1', userId: 'u7', role: 'VIEWER' }))
  })

  it('adds a team in a step of its own: its people\'s role, who joins as what, and its agents assigned', async () => {
    show(urlOf({ kind: 'list', adding: 'teams' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to Website relaunch' })
    expect(within(dialog).getAllByRole('tab').map(t => t.textContent)).toEqual(['People', 'Agents', 'Teams'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Operations' }))
    const step = screen.getByTestId('add-team-step')
    const joins = within(step).getByRole('list', { name: 'Who joins' })
    expect(within(joins).getByText('Already an Admin here; keeps it, the higher role wins')).toBeTruthy()
    expect(within(joins).getByText('Assigned')).toBeTruthy()
    fireEvent.click(within(step).getByRole('radio', { name: /Viewer/ }))
    expect(within(step).getByText(/later joins here as Viewer/)).toBeTruthy()
    fireEvent.click(within(step).getByRole('button', { name: 'Add Operations' }))
    await waitFor(() => expect(state.actions.addTeamToProject).toHaveBeenCalledWith({ projectId: 'p1', teamId: 't2', role: 'VIEWER' }))
  })
})

describe('someone who may not manage', () => {
  it('sees no Add members and no ⋯', () => {
    state.manage = false
    show()
    expect(screen.queryByRole('button', { name: 'Add members' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^More about/ })).toBeNull()
    expect(screen.queryByLabelText("Studio's role here")).toBeNull()
  })
})

describe('before any agent is assigned', () => {
  it('shows where the first will appear, with Assign an agent', () => {
    state.agents = 0
    const url = show()
    expect(screen.getByText('3 people · no agents · 1 team')).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('no-agent-row')).getByRole('button', { name: 'Assign an agent' }))
    expect(url.toAdd).toHaveBeenCalledWith('agents')
  })
})
