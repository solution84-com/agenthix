/** The member list's words: where a role comes from, the roles that raise someone, and what a team's people get. */
import { describe, it, expect } from 'vitest'
import { agentSource, higherRoles, joinsAs, membersLine, ownRoleNote, personSource, teamRoleOf, throughTeamHints } from '../memberWords'

const studio = { id: 't1', name: 'Studio', role: 'MEMBER' as const }
const ops = { id: 't2', name: 'Operations', role: 'VIEWER' as const }

describe('where a role comes from', () => {
  it('says direct member, through a team, or both', () => {
    expect(personSource({ ownRole: 'ADMIN', teams: [] })).toBe('direct member')
    expect(personSource({ ownRole: null, teams: [studio] })).toBe('through Studio')
    expect(personSource({ ownRole: 'ADMIN', teams: [studio] })).toBe('direct member · also Member through Studio')
    expect(personSource({ ownRole: null, teams: [studio, ops] })).toBe('through Studio, Operations')
  })

  it('says an agent is assigned directly, through a team, or both', () => {
    expect(agentSource({ direct: true, teams: [] })).toBe('directly')
    expect(agentSource({ direct: false, teams: [studio] })).toBe('through Studio')
    expect(agentSource({ direct: true, teams: [studio] })).toBe('directly · also through Studio')
  })
})

describe('making someone a direct member', () => {
  it('offers only roles higher than their teams give', () => {
    expect(teamRoleOf([studio, ops])).toBe('MEMBER')
    expect(higherRoles([studio])).toEqual(['ADMIN'])
    expect(higherRoles([ops])).toEqual(['MEMBER', 'ADMIN'])
    expect(higherRoles([{ ...studio, role: 'ADMIN' }])).toEqual([])
  })

  it('says why the others change nothing', () => {
    expect(ownRoleNote('MEMBER', [studio])).toBe('The same as Studio gives')
    expect(ownRoleNote('VIEWER', [studio])).toBe('Lower than Studio gives: it would change nothing')
    expect(ownRoleNote('ADMIN', [studio])).toMatch(/settings and who is in it/)
  })

  it('says what to do instead of changing or removing someone a team brings', () => {
    const hints = throughTeamHints('Dana Fox', [studio])
    expect(hints.changeRole).toBe("Dana is here through Studio as Member. Change the team's role, or take them out of the team.")
    expect(hints.remove).toMatch(/^Dana is here through Studio\. Remove the team from this project/)
  })
})

describe("a team's people when it joins", () => {
  it('get the higher of their role now and the team role', () => {
    expect(joinsAs(null, 'MEMBER')).toEqual({ role: 'MEMBER', note: null })
    expect(joinsAs('ADMIN', 'MEMBER')).toEqual({ role: 'ADMIN', note: 'Already an Admin here; keeps it, the higher role wins' })
    expect(joinsAs('VIEWER', 'MEMBER').role).toBe('MEMBER')
    expect(joinsAs('MEMBER', 'MEMBER').note).toBe('Already here as Member')
  })
})

describe('the header', () => {
  it('counts people, agents and teams', () => {
    expect(membersLine({ people: 6, agents: 2, teams: 1 })).toBe('6 people · 2 agents · 1 team')
    expect(membersLine({ people: 1, agents: 0, teams: 0 })).toBe('1 person · no agents')
  })
})
