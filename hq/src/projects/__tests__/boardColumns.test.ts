/**
 * A board's columns (adr-0097): Backlog is no column, so a task's place is a
 * column name or nothing; a column is found by its name or its state.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BOARD_COLUMNS, parseColumns, sortedColumns, findColumn, resolveColumn, columnsFromInput,
  stateOfPlace, refuseBacklogColumn,
} from '../boardColumns'

const COLUMNS = [
  { name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 2 },
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', order: 0 },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', color: '#f59e0b', order: 1, autoQueue: true },
]

describe('parseColumns', () => {
  it('reads a stored array, or a JSON string of one', () => {
    expect(parseColumns(COLUMNS)).toHaveLength(3)
    expect(parseColumns(JSON.stringify(COLUMNS))).toHaveLength(3)
  })
  it('reads anything else as no columns', () => {
    expect(parseColumns(null)).toEqual([])
    expect(parseColumns('not json')).toEqual([])
    expect(parseColumns({ a: 1 })).toEqual([])
  })
})

describe('sortedColumns and findColumn', () => {
  it('orders by order', () => {
    expect(sortedColumns(COLUMNS).map(c => c.name)).toEqual(['todo', 'doing', 'done'])
  })
  it('finds a column by its name only', () => {
    expect(findColumn(COLUMNS, 'doing')?.label).toBe('Doing')
    expect(findColumn(COLUMNS, 'IN_PROGRESS')).toBeUndefined()
    expect(findColumn(COLUMNS, null)).toBeUndefined()
  })
})

describe('resolveColumn', () => {
  it('matches a name, a name in another case, or a state', () => {
    expect(resolveColumn(COLUMNS, 'doing')?.name).toBe('doing')
    expect(resolveColumn(COLUMNS, 'DOING')?.name).toBe('doing')
    expect(resolveColumn(COLUMNS, 'in_progress')?.name).toBe('doing')
  })
  it('answers nothing for a name the board does not have', () => {
    expect(resolveColumn(COLUMNS, 'review')).toBeUndefined()
  })
})

describe('stateOfPlace @SC-543', () => {
  it('is the column\'s state, and To do in the Backlog', () => {
    expect(stateOfPlace(COLUMNS, 'done')).toBe('DONE')
    expect(stateOfPlace(COLUMNS, null)).toBe('TODO')
  })
})

describe('columnsFromInput @SC-542', () => {
  it('numbers the columns in the order given and upper-cases their state', () => {
    const cols = columnsFromInput([
      { name: 'a', label: 'A', status: 'todo' },
      { name: 'b', label: 'B', status: 'done', autoQueue: true },
    ])
    expect(cols.map(c => [c.name, c.order, c.status, c.autoQueue])).toEqual([['a', 0, 'TODO', undefined], ['b', 1, 'DONE', true]])
    expect(cols.every(c => typeof c.color === 'string')).toBe(true)
  })
  it('gives the default columns when none are given', () => {
    expect(columnsFromInput(undefined)).toEqual(DEFAULT_BOARD_COLUMNS)
    expect(columnsFromInput([])).toEqual(DEFAULT_BOARD_COLUMNS)
  })
  it('refuses a column named backlog: Backlog is every board\'s already', () => {
    expect(() => columnsFromInput([{ name: 'backlog', label: 'Backlog', status: 'TODO' }])).toThrow(/Backlog/)
  })
  it('refuses a state that is not To do, In progress or Done', () => {
    expect(() => columnsFromInput([{ name: 'x', label: 'X', status: 'WAITING' }])).toThrow(/state/)
  })
})

describe('refuseBacklogColumn @SC-542', () => {
  it('lets every other name through', () => {
    expect(() => refuseBacklogColumn([{ name: 'todo' }])).not.toThrow()
    expect(() => refuseBacklogColumn([{ name: 'Backlog' }])).toThrow()
  })
})

describe('the default columns @SC-542', () => {
  it('are To do, In progress and Done, none starting work', () => {
    expect(DEFAULT_BOARD_COLUMNS.map(c => c.status)).toEqual(['TODO', 'IN_PROGRESS', 'DONE'])
    expect(DEFAULT_BOARD_COLUMNS.some(c => c.autoQueue)).toBe(false)
  })
})
