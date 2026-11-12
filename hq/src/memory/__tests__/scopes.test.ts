/** A memory's scope and the check before the meaning search (ADR-0188; spec decision 1, design section 3). */
import { describe, it, expect } from 'vitest'
import { recallableWhere, savingScope, scopeColumns, scopeKeyOf, scopeMatches, specificity, personOfTurnHome } from '../scopes'

const shop = { type: 'project' as const, id: 'shop' }
const turn = { personId: 'u1', agentId: 'kernel', place: shop }
const memory = (agentId: string | null, place: { type: string; id: string } | null, userId = 'u1') =>
  ({ userId, agentId, placeType: place?.type ?? null, placeId: place?.id ?? null })

describe('the scope match @SC-2101', () => {
  it('recalls a memory of the person only when work is for them', () => {
    expect(scopeMatches(memory(null, null), turn)).toBe(true)
    expect(scopeMatches(memory(null, null, 'u2'), turn)).toBe(false)
    expect(scopeMatches(memory(null, null), { ...turn, personId: null })).toBe(false)
  })

  it.each([
    ['person only: any agent, any place', null, null, true],
    ['person + this agent: in any place', 'kernel', null, true],
    ['person + another agent', 'scout', null, false],
    ['person + this place: any agent', null, shop, true],
    ['person + another place', null, { type: 'project', id: 'other' }, false],
    ['person + this agent + this place', 'kernel', shop, true],
    ['person + this agent + another place', 'kernel', { type: 'user', id: 'u1' }, false],
    ['person + another agent + this place', 'scout', shop, false],
  ])('%s', (_what, agentId, place, recalled) => {
    expect(scopeMatches(memory(agentId as string | null, place), turn)).toBe(recalled)
  })

  it('lets work with no place recall only what holds everywhere', () => {
    const nowhere = { ...turn, place: null }
    expect(scopeMatches(memory('kernel', null), nowhere)).toBe(true)
    expect(scopeMatches(memory('kernel', shop), nowhere)).toBe(false)
  })

  it('asks the database the same question, and nothing for work with no person', () => {
    expect(recallableWhere(turn)).toEqual({
      userId: 'u1',
      AND: [
        { OR: [{ agentId: null }, { agentId: 'kernel' }] },
        { OR: [{ placeType: null, placeId: null }, { placeType: 'project', placeId: 'shop' }] },
      ],
    })
    expect(recallableWhere({ ...turn, personId: null })).toBeNull()
  })
})

describe('the scope an agent saves into, and its key @SC-2101', () => {
  it('is always the person, the agent itself and where it works: never chosen by the caller', () => {
    expect(savingScope(turn)).toEqual({ person: 'u1', agent: 'kernel', place: shop })
    expect(savingScope({ ...turn, personId: null })).toBeNull()
  })

  it('makes one key from the three parts, a star for every agent or everywhere', () => {
    expect(scopeKeyOf({ person: 'u1', agent: 'kernel', place: shop })).toBe('person:u1/agent:kernel/place:project:shop')
    expect(scopeKeyOf({ person: 'u1', agent: null, place: null })).toBe('person:u1/agent:*/place:*')
    expect(scopeColumns({ person: 'u1', agent: null, place: { type: 'user', id: 'u1' } })).toEqual({
      scopeKey: 'person:u1/agent:*/place:user:u1', userId: 'u1', agentId: null, placeType: 'user', placeId: 'u1',
    })
  })

  it('counts how narrow a scope is, so an agent forgets its own copy first', () => {
    expect(specificity({ agentId: 'kernel', placeId: 'shop' })).toBe(2)
    expect(specificity({ agentId: null, placeId: 'shop' })).toBe(1)
    expect(specificity({ agentId: null, placeId: null })).toBe(0)
  })
})

describe('the person of a turn by its home @SC-2102', () => {
  it('is no one in a task thread outside the person\'s own space, which its project\'s members read', () => {
    expect(personOfTurnHome('TASK', shop, 'u1')).toBeNull()
    expect(personOfTurnHome('TASK', { type: 'user', id: 'u1' }, 'u1')).toBe('u1')
    expect(personOfTurnHome('PROJECT', shop, 'u1')).toBe('u1')
  })
})
