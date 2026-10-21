/** The order of an agent's line (spec §6): starts someone asked for first, then by priority, then by age. */
import { describe, it, expect } from 'vitest'
import { lineOrder } from '../queueNotes'

const at = (s: number) => new Date(1_000 + s)
const line = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, projectId: 'p1', assignedAgentId: 'ax', runStartedBy: null, priority: 'MEDIUM', createdAt: at(0), ...over })

describe("a queued task's place in its agent's line", () => {
  it('is by priority then age, with starts someone asked for first', () => {
    const sorted = [line('old'), line('asked', { runStartedBy: 'person', priority: 'LOW', createdAt: at(9) }), line('high', { priority: 'HIGH', createdAt: at(5) })]
      .sort(lineOrder).map(t => t.id)
    expect(sorted).toEqual(['asked', 'high', 'old'])
  })
})
