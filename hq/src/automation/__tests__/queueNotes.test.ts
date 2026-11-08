/** The order of an agent's line (spec D14): the project's rank, whatever started each task, its priority or its age. */
import { describe, it, expect } from 'vitest'
import { lineOrder } from '../queueNotes'
import { explicitStarterOf } from '../../agents/agentLineOrder'

const line = (id: string, rank: string | null, number: number) => ({ id, rank, number })

describe("a queued task's place in its agent's line", () => {
  it('is by rank, by code unit, with unranked tasks last and ties by number', () => {
    const sorted = [line('b', 'm', 1), line('none', null, 2), line('a', 'b', 9), line('A', 'B', 5), line('b2', 'm', 0)]
      .sort(lineOrder).map(t => t.id)
    expect(sorted).toEqual(['A', 'a', 'b2', 'b', 'none'])
  })
})

describe('what may start a task in a line', () => {
  it('is an explicit act only: a person, a start time, or an agent with its tool', () => {
    expect(['person', 'schedule', 'agent'].map(explicitStarterOf)).toEqual(['person', 'schedule', 'agent'])
  })

  it('never the pulse, nothing, or anything else stored', () => {
    for (const v of ['pulse', null, undefined, '', 'Person', 1]) expect(explicitStarterOf(v)).toBeNull()
  })
})
