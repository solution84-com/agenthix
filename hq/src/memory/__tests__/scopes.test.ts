import { describe, it, expect } from 'vitest'
import { reachableTargets, scopeRefusal, scopeTarget } from '../scopes'

const place = { type: 'project' as const, id: 'p1' }

describe('who reaches which memory @SC-986', () => {
  it('a principal with a person reaches the person\'s scopes and the agent × place of its place', () => {
    const targets = reachableTargets({ personId: 'u1', agentId: 'a1', place })
    expect(targets.map(t => t.scopeKey)).toEqual(['person:u1', 'agent-person:a1:u1', 'agent-place:a1:project:p1'])
  })

  it('a run nobody commissioned reaches agent × place only', () => {
    expect(reachableTargets({ personId: null, agentId: 'a1', place }).map(t => t.scope)).toEqual(['AGENT_PLACE'])
    expect(scopeTarget({ personId: null, agentId: 'a1', place }, 'PERSON')).toBeNull()
    expect(scopeRefusal({ personId: null, agentId: 'a1', place }, 'PERSON')).toMatch(/not for any person/)
  })

  it('agent × place is that place\'s, and another place\'s is another scope', () => {
    const here = scopeTarget({ personId: 'u1', agentId: 'a1', place }, 'AGENT_PLACE')
    const there = scopeTarget({ personId: 'u1', agentId: 'a1', place: { type: 'project', id: 'p2' } }, 'AGENT_PLACE')
    expect(here?.scopeKey).not.toBe(there?.scopeKey)
    expect(here).toMatchObject({ userId: null, agentId: 'a1', placeType: 'project', placeId: 'p1' })
  })

  it('without a place there is no agent × place', () => {
    expect(scopeTarget({ personId: 'u1', agentId: 'a1', place: null }, 'AGENT_PLACE')).toBeNull()
  })

  it('narrows to the scopes asked for, within what it reaches', () => {
    expect(reachableTargets({ personId: null, agentId: 'a1', place }, ['PERSON', 'AGENT_PLACE']).map(t => t.scope)).toEqual(['AGENT_PLACE'])
  })

  it('a person\'s own scopes carry the person, and the person\'s global scope no agent', () => {
    expect(scopeTarget({ personId: 'u1', agentId: 'a1', place }, 'PERSON')).toMatchObject({ userId: 'u1', agentId: null })
    expect(scopeTarget({ personId: 'u1', agentId: 'a1', place }, 'AGENT_PERSON')).toMatchObject({ userId: 'u1', agentId: 'a1' })
  })
})
