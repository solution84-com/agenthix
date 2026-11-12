// @vitest-environment jsdom
/** Teams and a team’s page (every screen reviewed spec §3, Organisation). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const ops = vi.hoisted(() => ({ role: 'ADMIN' as string | undefined }))
const person = (userId: string, name: string) => ({ userId, name, handle: name.toLowerCase(), avatarUrl: null, state: 'active' })
const TEAM = {
  id: 't1', name: 'Marketing', purpose: 'Launches, content and the website', avatarUrl: null, coverUrl: null,
  people: [person('u1', 'Sam'), person('u2', 'Dana')], agents: [{ id: 'cw', name: 'Content writer', handle: 'content-writer', avatarUrl: null }],
  userIds: ['u1', 'u2'], agentIds: ['cw'], projectCount: 2,
}
const DETAIL = { ...TEAM, projects: [{ id: 'p1', name: 'Website Redesign', key: 'WEB', role: 'MEMBER' }], privateProjects: 1 }
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({
    data: query === 'getTeams' ? [TEAM, { ...TEAM, id: 't2', name: 'Support', projectCount: 0, people: [], agents: [], userIds: [], agentIds: [] }]
      : query === 'getTeam' ? DETAIL : query === 'getUserSettings' ? (ops.role ? { role: ops.role } : undefined)
      : query === 'getProjectCards' ? { cards: [] } : query === 'getOrgAgents' ? { agents: [{ agent: { id: 'cw' }, now: { state: 'running' } }] } : undefined,
    isLoading: false, error: undefined, refetch: vi.fn(),
  }),
  useAction: () => vi.fn(),
  getTeams: 'getTeams', getTeam: 'getTeam', getUserSettings: 'getUserSettings', getProjectCards: 'getProjectCards', getOrgAgents: 'getOrgAgents',
  getOrgPeople: 'getOrgPeople', getProjects: 'getProjects', createTeam: 'c', updateTeam: 'u', deleteTeam: 'd', uploadTeamImage: 'ui', removeTeamImage: 'ri', savePictures: 'savePictures', addTeamToProject: 'a',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => <div>{action}{children}</div> }))
vi.mock('../../../shared/components/AuthedImg', () => ({ AuthedImg: () => null }))
vi.mock('../../../people/AuthedPersonAvatar', () => ({ AuthedPersonAvatar: ({ person: p }: { person: { name: string } }) => <span>{p.name.slice(0, 1)}</span> }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span>{name.slice(0, 1)}</span> }))
// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon }
})

import { TeamsPage } from '../TeamsPage'
import { TeamPage } from '../TeamPage'

beforeEach(() => { ops.role = 'ADMIN' })
afterEach(cleanup)

describe('Teams @SC-669', () => {
  const show = () => render(<MemoryRouter><TeamsPage /></MemoryRouter>)

  it('shows a card for each team with its purpose, mix and where it works', () => {
    show()
    const cards = screen.getAllByRole('link')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('Marketing')).toBeTruthy()
    expect(within(cards[0]).getByText('Launches, content and the website')).toBeTruthy()
    expect(within(cards[0]).getByText('2 people · 1 agent')).toBeTruthy()
    expect(within(cards[0]).getByText('Works in 2 projects')).toBeTruthy()
    expect(within(cards[1]).getByText('Not in a project yet')).toBeTruthy()
    expect(cards[0].getAttribute('href')).toBe('/org/teams/t1')
  })

  it('offers New to an admin only', () => {
    show()
    expect(screen.getByRole('button', { name: /New/ })).toBeTruthy()
    cleanup()
    ops.role = 'MEMBER'
    show()
    expect(screen.queryByRole('button', { name: /New/ })).toBeNull()
  })
})

describe('a team’s page @SC-669', () => {
  const show = () => render(
    <MemoryRouter initialEntries={['/org/teams/t1']}><Routes><Route path="/org/teams/:id" element={<TeamPage />} /></Routes></MemoryRouter>,
  )

  it('has the hero, its people and agents with what each is doing, and the projects it works in', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Marketing' })).toBeTruthy()
    expect(screen.getByText('People · 2')).toBeTruthy()
    expect(screen.getByText('Agents · 1')).toBeTruthy()
    expect(screen.getByText(/@content-writer · Running/)).toBeTruthy()
    expect(screen.getByText('Works in · 2 projects')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Website Redesign/ }).getAttribute('href')).toBe('/projects/WEB')
    expect(screen.getByText('And 1 private project you are not in.')).toBeTruthy()
  })

  it('gives an admin Add to a project, ⋯ and Change cover, and a member none of them', () => {
    show()
    expect(screen.getByRole('button', { name: 'Add to a project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Change cover/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add people or agents/ })).toBeTruthy()
    cleanup()
    ops.role = 'MEMBER'
    show()
    for (const name of [/Add to a project/, /^More$/, /Change cover/, /Add people or agents/]) expect(screen.queryByRole('button', { name })).toBeNull()
  })
})
