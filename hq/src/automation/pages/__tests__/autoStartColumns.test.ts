import { describe, it, expect } from 'vitest'
import { autoStartColumns } from '../autoStartColumns'

const column = (name: string, order: number, autoQueue = false) => ({ name, label: name.replace(/^\w/, c => c.toUpperCase()), order, autoQueue })

describe('Rules: the columns that start work automatically @SC-512', () => {
  it('lists only the columns switched on, grouped by board, in column order', () => {
    expect(autoStartColumns([
      { id: 'b1', name: 'Release board', columns: [column('review', 2, true), column('todo', 0), column('progress', 1, true)] },
      { id: 'b2', name: 'Ideas', columns: [column('todo', 0)] },
      { id: 'b3', name: 'Ops', columns: JSON.stringify([column('triage', 0, true)]) },
    ])).toEqual([
      { boardId: 'b1', name: 'Release board', columns: ['Progress', 'Review'] },
      { boardId: 'b3', name: 'Ops', columns: ['Triage'] },
    ])
  })

  it('leaves out an archived board, and a board whose columns cannot be read', () => {
    expect(autoStartColumns([
      { id: 'b1', name: 'Done', archivedAt: '2026-10-01T00:00:00.000Z', columns: [column('todo', 0, true)] },
      { id: 'b2', name: 'Broken', columns: 'not json' },
    ])).toEqual([])
  })

  it("names a column by its name when it has no label", () => {
    expect(autoStartColumns([{ id: 'b', name: 'B', columns: [{ name: 'ready', autoQueue: true }] }])).toEqual([
      { boardId: 'b', name: 'B', columns: ['ready'] },
    ])
  })
})
