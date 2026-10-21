import { describe, it, expect } from 'vitest'
import { countOutcomes } from '../outcomeCounts'
import { scopeLabel } from '../scopeLabel'

describe('countOutcomes @SC-991', () => {
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

describe('scopeLabel @SC-991', () => {
  it('names each scope the way the screen does', () => {
    expect(scopeLabel('PERSON', null, null)).toBe('Everyone you work with')
    expect(scopeLabel('AGENT_PERSON', 'Developer', null)).toBe('Developer, about you')
    expect(scopeLabel('AGENT_PLACE', 'Developer', 'Shop')).toBe('Developer, in Shop')
  })
})
