/** One page of a list: the filters, then the counts, then the card, the order and the page. */
import { describe, it, expect } from 'vitest'
import { pageOf, type ListedRow } from '../taskListPage'

const TODAY = '2026-11-07'
let n = 0
const row = (over: Partial<ListedRow> = {}): ListedRow => ({
  id: `t${++n}`, title: `Task ${n}`, number: n, projectId: 'p1', projectKey: 'WEB', typeName: 'Task', columnName: 'To do',
  state: 'TODO', due: null, agentId: 'a1', epicId: null, sprintId: null, optionIds: [], priority: 'MEDIUM', rank: null,
  updatedAt: new Date('2026-11-01'), createdAt: new Date('2026-10-01'), ...over,
})

describe('a page of a list', () => {
  it('counts what the filters let through, whichever card is chosen', () => {
    const rows = [row({ typeName: 'Bug', state: 'BACKLOG' }), row({ typeName: 'Bug' }), row()]
    const page = pageOf(rows, { type: 'Bug', card: 'backlog' }, TODAY, 'rank')
    expect(page.counts).toMatchObject({ all: 2, backlog: 1, todo: 1 })
    expect(page.rows.map(r => r.typeName)).toEqual(['Bug'])
  })

  it('filters by column, state, epic, sprint, agent, priority and a custom field’s option', () => {
    const target = row({ columnName: 'Reported', state: 'BACKLOG', epicId: 'e1', sprintId: 's1', agentId: 'a2', priority: 'HIGH', optionIds: ['o1'] })
    const rows = [target, row()]
    const args = { column: 'Reported', state: 'BACKLOG' as const, epicId: 'e1', sprintId: 's1', agentId: 'a2', priority: 'HIGH' as const, optionId: 'o1' }
    expect(pageOf(rows, args, TODAY, 'rank').rows).toEqual([target])
  })

  it('narrows to Late and No agent', () => {
    const late = row({ due: '2026-11-01' })
    const free = row({ agentId: null })
    expect(pageOf([late, free, row()], { card: 'late' }, TODAY, 'rank').rows).toEqual([late])
    expect(pageOf([late, free, row()], { card: 'noAgent' }, TODAY, 'rank').rows).toEqual([free])
  })

  it('sorts by the list’s own order when none is asked for, and pages', () => {
    const rows = [row({ rank: 'c' }), row({ rank: 'a' }), row({ rank: 'b' })]
    const page = pageOf(rows, { limit: 2 }, TODAY, 'rank')
    expect(page.rows.map(r => r.rank)).toEqual(['a', 'b'])
    expect(page.hasMore).toBe(true)
  })

  it('searches the title and the key', () => {
    const rows = [row({ title: 'Fix the contact form', number: 14 }), row({ title: 'Other', number: 99 })]
    expect(pageOf(rows, { search: 'contact' }, TODAY, 'rank').rows.map(r => r.number)).toEqual([14])
    expect(pageOf(rows, { search: 'WEB-14' }, TODAY, 'rank').rows.map(r => r.number)).toEqual([14])
  })
})
