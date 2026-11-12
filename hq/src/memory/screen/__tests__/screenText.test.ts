import { describe, it, expect } from 'vitest'
import { countOutcomes } from '../outcomeCounts'
import { agentsLabel, placeLabel } from '../pages/memoryFormat'

describe('countOutcomes @SC-2108', () => {
  it('puts each kind in its own figure and sums repeated groups', () => {
    expect(countOutcomes([
      { kind: 'INCLUDED', count: 5 }, { kind: 'HINTED', count: 2 }, { kind: 'RECALLED', count: 4 },
      { kind: 'USED', count: 3 }, { kind: 'UNUSED', count: 1 }, { kind: 'MISSED', count: 7 }, { kind: 'USED', count: 2 },
    ])).toEqual({ included: 5, hinted: 2, recalled: 4, used: 5, unused: 1, missed: 7 })
  })
  it('ignores a kind it does not know and starts every figure at zero', () => {
    expect(countOutcomes([{ kind: 'SOMETHING', count: 9 }])).toEqual({ included: 0, hinted: 0, recalled: 0, used: 0, unused: 0, missed: 0 })
  })
})

describe('the scope badges @SC-2108', () => {
  it('name the one agent and place, or every agent and everywhere, in the words of the switches', () => {
    expect(agentsLabel({ agent: { id: 'a1', name: 'Kernel' } })).toBe('Kernel')
    expect(agentsLabel({ agent: null })).toBe('Every agent')
    expect(placeLabel({ place: { type: 'project', id: 'p1', name: 'Shop' } })).toBe('Shop')
    expect(placeLabel({ place: null })).toBe('Everywhere')
  })
})
