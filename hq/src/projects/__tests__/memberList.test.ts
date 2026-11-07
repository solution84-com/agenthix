/** A project's Members as one list: search, team, filter, sort and paging (memberList.ts). */
import { describe, it, expect } from 'vitest'
import { memberListPage, readMemberListArgs, type MemberRow, type PersonMember, type AgentMember, type TeamMember } from '../memberList'

const idlePerson = { state: 'idle' as const, lead: null, needsYouCount: 0, runningCount: 0 }
const idleAgent = { ...idlePerson, next: null }
const day = (n: number) => new Date(Date.UTC(2026, 10, n))
const studio = { id: 't1', name: 'Studio', role: 'MEMBER' as const }

const person = (id: string, name: string, extra: Partial<PersonMember> = {}): PersonMember => ({
  kind: 'person', id, name, handle: name.toLowerCase(), avatarUrl: null, role: 'MEMBER', ownRole: 'MEMBER', teams: [],
  isLead: false, isMe: false, addedAt: day(1), lastActiveAt: null, now: idlePerson, ...extra,
})
const agent = (id: string, name: string, extra: Partial<AgentMember> = {}): AgentMember => ({
  kind: 'agent', id, name, handle: id, description: null, avatarUrl: null, isDefault: false, direct: true, teams: [],
  addedAt: day(1), lastActiveAt: null, now: idleAgent, ...extra,
})
const team = (id: string, name: string, extra: Partial<TeamMember> = {}): TeamMember => ({
  kind: 'team', id, name, avatarUrl: null, role: 'MEMBER', peopleCount: 2, agentCount: 1, addedBy: null, addedAt: day(1), lastActiveAt: null, ...extra,
})

const rows: MemberRow[] = [
  person('u1', 'Sam Okafor', { addedAt: day(3), lastActiveAt: day(5) }),
  person('u2', 'alex Moreau', { ownRole: null, teams: [studio], addedAt: day(4) }),
  person('u3', 'Priya Nair', { role: 'ADMIN', ownRole: 'ADMIN', teams: [studio], lastActiveAt: day(6), now: { ...idlePerson, state: 'needsYou', needsYouCount: 2 } }),
  agent('a1', 'Writer', { direct: false, teams: [studio], description: 'Drafts and edits copy', now: { ...idleAgent, state: 'running', runningCount: 1 } }),
  agent('a2', 'Reviewer', { addedAt: day(2), now: { ...idleAgent, state: 'needsYou', needsYouCount: 1 } }),
  team('t1', 'Studio', { addedAt: day(5) }),
]
const page = (args: Record<string, unknown> = {}) => memberListPage(rows, readMemberListArgs(args))
const names = (args: Record<string, unknown> = {}) => page(args).rows.map(r => r.name)

describe('the one member list', () => {
  it('lists people, agents and teams together by name, ignoring case, and counts each', () => {
    const p = page()
    expect(p.rows.map(r => r.name)).toEqual(['alex Moreau', 'Priya Nair', 'Reviewer', 'Sam Okafor', 'Studio', 'Writer'])
    expect(p.counts).toEqual({ everyone: 6, people: 3, agents: 2, teams: 1 })
    expect(p.total).toBe(6)
  })

  it('filters to people, agents or teams, keeping every count', () => {
    expect(names({ filter: 'people' })).toEqual(['alex Moreau', 'Priya Nair', 'Sam Okafor'])
    expect(names({ filter: 'agents' })).toEqual(['Reviewer', 'Writer'])
    expect(names({ filter: 'teams' })).toEqual(['Studio'])
    expect(page({ filter: 'teams' }).counts.people).toBe(3)
  })

  it('searches every kind, by name, handle or what an agent does, and counts what matches', () => {
    expect(names({ search: 'st' })).toEqual(['Studio'])
    expect(names({ search: '@sam' })).toEqual(['Sam Okafor'])
    expect(names({ search: 'drafts' })).toEqual(['Writer'])
    expect(page({ search: 'r' }).counts).toEqual({ everyone: 5, people: 3, agents: 2, teams: 0 })
  })

  it('narrows to one team: its row first, then its people and agents', () => {
    const p = page({ teamId: 't1' })
    expect(p.rows.map(r => r.name)).toEqual(['Studio', 'alex Moreau', 'Priya Nair', 'Writer'])
    expect(p.counts).toEqual({ everyone: 4, people: 2, agents: 1, teams: 1 })
    expect(page({ teamId: 't1', sort: 'added' }).rows[0].name).toBe('Studio')
  })

  it('sorts by recently added, recently active, or what needs someone first', () => {
    expect(names({ sort: 'added' })).toEqual(['Studio', 'alex Moreau', 'Sam Okafor', 'Reviewer', 'Priya Nair', 'Writer'])
    expect(names({ sort: 'active' }).slice(0, 2)).toEqual(['Priya Nair', 'Sam Okafor'])
    expect(names({ sort: 'needs' }).slice(0, 3)).toEqual(['Priya Nair', 'Reviewer', 'Writer'])
  })

  it('pages, saying how many there are in all', () => {
    const p = page({ offset: 2, limit: 2 })
    expect(p.rows.map(r => r.name)).toEqual(['Reviewer', 'Sam Okafor'])
    expect(p.total).toBe(6)
  })

  it('refuses a filter, sort or page it does not know', () => {
    expect(() => readMemberListArgs({ filter: 'robots' })).toThrow(/filter/)
    expect(() => readMemberListArgs({ sort: 'age' })).toThrow(/sort/)
    expect(() => readMemberListArgs({ offset: -1 })).toThrow(/whole/)
    expect(() => readMemberListArgs({ limit: 1.5 })).toThrow(/whole/)
    expect(readMemberListArgs({ limit: 10_000 }).limit).toBe(200)
  })
})
