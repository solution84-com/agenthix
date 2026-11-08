/** Plan Sprint's rules (spec N1, D14): filters, Group by epic, and where a drop or a step lands in the one order. */
import { describe, expect, it } from 'vitest'
import { dropSlotText, filterRows, groupByEpic, moved, NO_FILTER, placeAt, stepIndex, wholeIndex, type PlanRow } from '../planRules'

const row = (id: string, over: Partial<PlanRow> = {}): PlanRow => ({
  id, key: `WEB-${id}`, title: `Task ${id}`, state: 'BACKLOG', epicId: null, type: { id: 'task', name: 'Task' }, ...over,
})
const ids = (rows: { id: string }[]) => rows.map(r => r.id)

describe('the left list', () => {
  const rows = [row('1', { title: 'Fix the 404 page', type: { id: 'bug', name: 'Bug' } }), row('2', { epicId: 'e1' }), row('3', { epicId: 'e2' })]

  it('searches title and key, and filters by type and epic', () => {
    expect(ids(filterRows(rows, { ...NO_FILTER, search: '404' }))).toEqual(['1'])
    expect(ids(filterRows(rows, { ...NO_FILTER, search: 'web-3' }))).toEqual(['3'])
    expect(ids(filterRows(rows, { ...NO_FILTER, typeId: 'bug' }))).toEqual(['1'])
    expect(ids(filterRows(rows, { ...NO_FILTER, epicId: 'e1' }))).toEqual(['2'])
  })

  it('groups under the epics in their order, then the rows in none, leaving out an epic with none here', () => {
    const groups = groupByEpic(rows, [{ id: 'e2', key: 'WEB-9', title: 'Site speed' }, { id: 'e1', key: 'WEB-8', title: 'Launch pages' }, { id: 'e3', key: 'WEB-7', title: 'Empty' }])
    expect(groups.map(g => [g.epic?.title ?? null, ids(g.rows)])).toEqual([['Site speed', ['3']], ['Launch pages', ['2']], [null, ['1']]])
  })
})

describe('where a row lands', () => {
  const sprint = [row('a'), row('b'), row('c')]

  it('goes after the row above, or before the first at the top', () => {
    expect(placeAt(sprint, 'x', 0)).toEqual({ beforeTaskId: 'a' })
    expect(placeAt(sprint, 'x', 2)).toEqual({ afterTaskId: 'b' })
    expect(placeAt(sprint, 'x', 3)).toEqual({ afterTaskId: 'c' })
    expect(placeAt([], 'x', 0)).toEqual({})
  })

  it('counts a drop among the rows shown as a place in the whole list, without the dragged row', () => {
    const whole = [row('a'), row('h'), row('b'), row('c')]
    const shown = [row('a'), row('b'), row('c')]
    expect(wholeIndex(whole, shown, 'c', 1)).toBe(1)
    expect(wholeIndex(whole, shown, 'x', 2)).toBe(3)
    expect(wholeIndex(whole, shown, 'a', 0)).toBe(1)
    expect(wholeIndex(whole, [], 'x', 0)).toBe(4)
  })

  it('steps a row past the one shown above or below, and not past the ends', () => {
    const whole = [row('a'), row('h'), row('b'), row('c')]
    const shown = [row('a'), row('b'), row('c')]
    const down = stepIndex(whole, shown, 'a', 1)!
    expect(ids(moved(whole, row('a'), down))).toEqual(['h', 'b', 'a', 'c'])
    const up = stepIndex(whole, shown, 'c', -1)!
    expect(ids(moved(whole, row('c'), up))).toEqual(['a', 'h', 'c', 'b'])
    expect(stepIndex(whole, shown, 'a', -1)).toBeNull()
    expect(stepIndex(whole, shown, 'c', 1)).toBeNull()
  })

  it('says a Backlog task dropped in moves to To do (N1)', () => {
    expect(dropSlotText(2, 'BACKLOG')).toBe('Drops here, 3rd · moves to To do')
    expect(dropSlotText(0, 'TODO')).toBe('Drops here, 1st')
    expect(dropSlotText(10, 'TODO')).toBe('Drops here, 11th')
  })
})
