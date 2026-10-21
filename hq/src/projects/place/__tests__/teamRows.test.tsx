// @vitest-environment jsdom
/** A project’s panel (every screen reviewed spec §3): one Members row after the facts, in place of People and Agents. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { memberAliases, teamRows, type PanelRows } from '../teamRows'

vi.mock('../members/ProjectMembersTool', () => ({ ProjectMembersTool: () => <p>the members</p> }))
vi.mock('../../../people/AuthedPersonAvatar', () => ({ AuthedPersonAvatar: () => null }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))

const rows: PanelRows = {
  people: { count: 4, avatars: [{ userId: 'u1', name: 'A', avatarUrl: null }, { userId: 'u2', name: 'B', avatarUrl: null }, { userId: 'u3', name: 'C', avatarUrl: null }] },
  agents: { count: 3, avatars: [{ id: 'a1', name: 'X', avatarUrl: null }, { id: 'a2', name: 'Y', avatarUrl: null }] },
}

describe('the panel rows @SC-676', () => {
  it('is one Members row counting the people and the agents', () => {
    const [only, ...rest] = teamRows('p1', rows)
    expect(rest).toEqual([])
    expect(only.id).toBe('members')
    expect(only.label).toBe('Members')
    expect(only.count).toBe('7')
  })

  it('has no count until the rows are read', () => {
    expect(teamRows('p1', undefined)[0].count).toBeUndefined()
  })

  it('keeps ?tool=people and ?tool=agents opening Members', () => {
    expect(memberAliases('p1').map(t => [t.id, t.label, t.aliasOf])).toEqual([['people', 'Members', 'members'], ['agents', 'Members', 'members']])
  })
})
