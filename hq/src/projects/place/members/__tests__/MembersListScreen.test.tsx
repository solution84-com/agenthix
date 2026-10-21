// @vitest-environment jsdom
/** A project's Members (every screen reviewed spec §3): teams as cards, then people, then agents, with who is here through a team. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
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

const data = vi.hoisted(() => ({ canManage: true, agentsCanManage: true }))

const idle = { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null }
const personNow = { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0 }
const counts = { todo: 0, inProgress: 0, done: 0, needsYou: 0, running: 0, total: 0 }
const person = (userId: string, name: string) => ({ userId, name, handle: name.toLowerCase(), avatarUrl: null, state: 'active' })
const personRow = (userId: string, name: string, role = 'MEMBER') => ({ person: person(userId, name), role, joinedAt: new Date('2026-10-01'), now: personNow, items: [], tasks: counts, lastActiveAt: null })
const agentRow = (id: string, name: string, isDefault = false) => ({
  agent: { id, name, handle: id, role: null, avatarUrl: null, coverUrl: null, defaultModel: 'sonnet', runtime: 'claude-sdk', approval: 'deferred' },
  isDefault, now: idle, tasks: counts, model: { own: 'sonnet', here: 'sonnet', narrowed: false }, narrowed: false,
})

const results: Record<string, () => unknown> = {
  getProjectPeople: () => ({
    project: { id: 'p1', key: 'WEB', name: 'Website', accessLevel: 'PRIVATE', personal: false },
    canManage: data.canManage,
    people: [personRow('u1', 'Avery', 'ADMIN'), personRow('u2', 'Sam', 'ADMIN'), personRow('u3', 'Dana')],
  }),
  getProjectAgents: () => ({ canManage: data.agentsCanManage, agents: [agentRow('fd', 'Frontend dev', true), agentRow('cw', 'Content writer')] }),
  getPlaceInstructions: () => ({ everyAgent: null }),
  getProjectTeams: () => ({
    teams: [{ id: 't1', name: 'Marketing', purpose: '', avatarUrl: null, coverUrl: null, role: 'MEMBER', addedBy: person('u1', 'Avery'), addedAt: new Date('2026-10-05'), userIds: ['u2', 'u3'], agentIds: ['cw'] }],
    people: [
      { userId: 'u1', direct: true, ownRole: 'ADMIN', teamIds: [] },
      { userId: 'u2', direct: true, ownRole: 'ADMIN', teamIds: ['t1'] },
      { userId: 'u3', direct: false, ownRole: null, teamIds: ['t1'] },
    ],
    agents: [{ agentId: 'fd', direct: true, teamIds: [] }, { agentId: 'cw', direct: false, teamIds: ['t1'] }],
  }),
}

vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({ data: results[query]?.(), isLoading: false, error: undefined, refetch: vi.fn() }),
  useAction: () => vi.fn(),
  getProjectPeople: 'getProjectPeople', getProjectAgents: 'getProjectAgents', getPlaceInstructions: 'getPlaceInstructions',
  getProjectTeams: 'getProjectTeams', setProjectTeamRole: 'setProjectTeamRole',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../../../people/AuthedPersonAvatar', () => ({ personAvatarOf: (p: { name: string }) => <span>{p.name.slice(0, 1)}</span> }))
vi.mock('../../../../people/PersonProfileCard', () => ({ PersonProfileTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../agents/avatarOf', () => ({ avatarOf: (a: { name: string }) => <span>{a.name.slice(0, 1)}</span> }))
vi.mock('../../../../shared/components/AuthedImg', () => ({ AuthedImg: () => null }))

import { MembersListScreen } from '../MembersListScreen'

const url = {
  screen: { kind: 'list' as const },
  toList: vi.fn(), toAddPerson: vi.fn(), toAddAgent: vi.fn(), toAddTeam: vi.fn(), toRemoveTeam: vi.fn(), toPerson: vi.fn(), toAgent: vi.fn(),
}
const show = () => render(<MemoryRouter><MembersListScreen projectId="p1" url={url} /></MemoryRouter>)

beforeEach(() => { data.canManage = true; data.agentsCanManage = true; vi.clearAllMocks() })
afterEach(cleanup)

describe('Members @SC-676', () => {
  it('lists teams as cards, then people, then agents', () => {
    show()
    const headings = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)
    expect(headings).toEqual(['Teams · 1', 'People · 3', 'Agents · 2'])
    const card = screen.getByTestId('project-team-card')
    expect(within(card).getByText('Marketing')).toBeTruthy()
    expect(within(card).getByText(/2 people · 1 agent · added by Avery/)).toBeTruthy()
  })

  it('names the team beside someone there through it, and says it is changed in the team', () => {
    show()
    expect(screen.getByText(/Through Marketing — change in the team/)).toBeTruthy()
    expect(screen.getByText(/Also added in person/)).toBeTruthy()
    // Dana (only through the team) and Sam (also in person) both carry the chip; Avery does not.
    expect(screen.getAllByText('Marketing').length).toBeGreaterThanOrEqual(4)
  })

  it('shows the default agent as such, and each agent with its state', () => {
    show()
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getAllByText(/Idle/i).length).toBeGreaterThan(0)
  })

  it('filters to people or to agents', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /^People 3/ }))
    expect(screen.queryByText(/^Agents · /)).toBeNull()
    expect(screen.queryByText(/^Teams · /)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Agents 2/ }))
    expect(screen.queryByText(/^People · /)).toBeNull()
    expect(screen.getByText('Frontend dev')).toBeTruthy()
  })

  it('searches across the members', () => {
    show()
    fireEvent.change(screen.getByPlaceholderText('Search members'), { target: { value: 'dana' } })
    expect(screen.getByText('Dana')).toBeTruthy()
    expect(screen.queryByText('Sam')).toBeNull()
    expect(screen.queryByText('Frontend dev')).toBeNull()
  })

  it('offers Add a person, an agent or a team to someone who may manage, and Remove team on a card', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('menuitem', { name: /A team/ }))
    expect(url.toAddTeam).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'More about Marketing' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove team' }))
    expect(url.toRemoveTeam).toHaveBeenCalledWith('t1')
  })

  it('offers no Add, no role change and no Remove team to someone who may not manage', () => {
    data.canManage = false
    data.agentsCanManage = false
    show()
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More about Marketing' })).toBeNull()
    expect(screen.queryByLabelText("Marketing's role here")).toBeNull()
  })
})
