/** What a board shows and what a drop on it changes (adr-0176, data model "How each board kind reads it"). */
import { describe, it, expect } from 'vitest'
import {
  boardColumns, columnKeyOf, dropChange, EXECUTION_NOT_DRAGGED, groupIntoColumns, isOnBoard, matchesFilter, NO_VALUE_KEY,
  NOT_A_COLUMN, NOT_ON_BOARD, rowNeedsYou, type BoardSpec, type BoardTaskRow,
} from '../boardViewRules'

const row = (over: Partial<BoardTaskRow> = {}): BoardTaskRow => ({
  id: 't1', typeId: 'bug', typeKind: 'CUSTOM', columnId: 'triaged', state: 'TODO', executionState: 'NOT_STARTED',
  sprintId: null, epicId: null, assignedAgentId: null, optionId: null, ...over,
})
const spec = (over: Partial<BoardSpec> = {}): BoardSpec => ({ kind: 'TYPE', typeId: 'bug', fieldId: null, filter: {}, ...over })

const bugColumns = [
  { id: 'reported', name: 'Reported', colour: 'neutral', state: 'BACKLOG' as const },
  { id: 'triaged', name: 'Triaged', colour: 'accent', state: 'TODO' as const },
  { id: 'fixing', name: 'Fixing', colour: 'nonsense', state: 'IN_PROGRESS' as const },
]

describe('a board\'s columns', () => {
  it('are a type\'s own columns, with an unknown colour drawn neutral', () => {
    const cols = boardColumns('TYPE', { typeColumns: bugColumns })
    expect(cols.map(c => c.key)).toEqual(['reported', 'triaged', 'fixing'])
    expect(cols[2]).toMatchObject({ name: 'Fixing', colour: 'neutral', state: 'IN_PROGRESS' })
  })
  it('are the four task states, Backlog first, on the task state board', () => {
    expect(boardColumns('STATE', {}).map(c => c.name)).toEqual(['Backlog', 'To do', 'In progress', 'Done'])
  })
  it('are the six execution states on the execution board', () => {
    expect(boardColumns('EXECUTION', {}).map(c => c.name)).toEqual(['Not started', 'Waiting', 'Running', 'Needs you', 'Failed', 'Finished'])
  })
  it('are "No value" then the field\'s options on a field board', () => {
    const cols = boardColumns('FIELD', { options: [{ id: 'o1', name: 'Design', colour: 'warning' }] })
    expect(cols.map(c => [c.key, c.name])).toEqual([[NO_VALUE_KEY, 'No value'], ['o1', 'Design']])
  })
})

describe('which tasks a board holds', () => {
  it('a type\'s board holds only that type\'s tasks', () => {
    expect(isOnBoard(spec(), row())).toBe(true)
    expect(isOnBoard(spec(), row({ typeId: 'task' }))).toBe(false)
  })
  it('the execution board never holds an epic, which is never run', () => {
    expect(isOnBoard(spec({ kind: 'EXECUTION', typeId: null }), row({ typeKind: 'EPIC' }))).toBe(false)
    expect(isOnBoard(spec({ kind: 'STATE', typeId: null }), row({ typeKind: 'EPIC' }))).toBe(true)
  })
  it('puts each task in the column its kind reads', () => {
    const r = row({ optionId: 'o1', state: 'IN_PROGRESS', executionState: 'RUNNING' })
    expect(columnKeyOf('TYPE', r)).toBe('triaged')
    expect(columnKeyOf('STATE', r)).toBe('IN_PROGRESS')
    expect(columnKeyOf('EXECUTION', r)).toBe('RUNNING')
    expect(columnKeyOf('FIELD', r)).toBe('o1')
    expect(columnKeyOf('FIELD', row())).toBe(NO_VALUE_KEY)
  })
  it('keeps the rank order within each column', () => {
    const rows = [row({ id: 'a', columnId: 'fixing' }), row({ id: 'b' }), row({ id: 'c', columnId: 'fixing' })]
    const grouped = groupIntoColumns('TYPE', boardColumns('TYPE', { typeColumns: bugColumns }), rows)
    expect(grouped.get('fixing')!.map(r => r.id)).toEqual(['a', 'c'])
    expect(grouped.get('reported')).toEqual([])
  })
})

describe('a board\'s filter', () => {
  it('to the current sprint follows the project\'s current one, and keeps nothing when it has none', () => {
    const f = { sprint: { current: true as const } }
    expect(matchesFilter(f, row({ sprintId: 's4' }), 's4')).toBe(true)
    expect(matchesFilter(f, row({ sprintId: 's3' }), 's4')).toBe(false)
    expect(matchesFilter(f, row({ sprintId: null }), null)).toBe(false)
  })
  it('to one sprint, an epic and an agent, all at once', () => {
    const f = { sprint: { sprintId: 's5' }, epicId: 'e1', agentId: 'w' }
    expect(matchesFilter(f, row({ sprintId: 's5', epicId: 'e1', assignedAgentId: 'w' }), 's4')).toBe(true)
    expect(matchesFilter(f, row({ sprintId: 's5', epicId: 'e1', assignedAgentId: 'r' }), 's4')).toBe(false)
    expect(matchesFilter(f, row({ sprintId: 's5', epicId: null, assignedAgentId: 'w' }), 's4')).toBe(false)
  })
  it('to no sprint keeps only the tasks in none', () => {
    const f = { sprint: { none: true as const } }
    expect(matchesFilter(f, row({ sprintId: null }), 's4')).toBe(true)
    expect(matchesFilter(f, row({ sprintId: 's4' }), 's4')).toBe(false)
  })
  it('to a type keeps only that type\'s tasks', () => {
    expect(matchesFilter({ typeId: 'bug' }, row({ typeId: 'bug' }), null)).toBe(true)
    expect(matchesFilter({ typeId: 'bug' }, row({ typeId: 'feature' }), null)).toBe(false)
  })
  it('with nothing in it keeps every task', () => {
    expect(matchesFilter({}, row(), null)).toBe(true)
  })
})

describe('a drop', () => {
  const typeCols = boardColumns('TYPE', { typeColumns: bugColumns })
  it('on a type\'s column sets the column', () => {
    expect(dropChange(spec(), typeCols, row(), 'fixing')).toEqual({ sets: 'column', columnId: 'fixing' })
  })
  it('in the column it is in changes only its rank', () => {
    expect(dropChange(spec(), typeCols, row(), 'triaged')).toEqual({ sets: 'rank' })
    const stateSpec = spec({ kind: 'STATE', typeId: null })
    expect(dropChange(stateSpec, boardColumns('STATE', {}), row({ state: 'TODO' }), 'TODO')).toEqual({ sets: 'rank' })
  })
  it('on a state sets the state', () => {
    const stateSpec = spec({ kind: 'STATE', typeId: null })
    expect(dropChange(stateSpec, boardColumns('STATE', {}), row(), 'DONE')).toEqual({ sets: 'state', state: 'DONE' })
  })
  it('on a field\'s option sets that value, and on "No value" clears it', () => {
    const fieldSpec = spec({ kind: 'FIELD', typeId: null, fieldId: 'f' })
    const cols = boardColumns('FIELD', { options: [{ id: 'o1', name: 'A', colour: 'neutral' }] })
    expect(dropChange(fieldSpec, cols, row(), 'o1')).toEqual({ sets: 'field', optionId: 'o1' })
    expect(dropChange(fieldSpec, cols, row({ optionId: 'o1' }), NO_VALUE_KEY)).toEqual({ sets: 'field', optionId: null })
  })
  it('on the execution board is refused', () => {
    expect(dropChange(spec({ kind: 'EXECUTION', typeId: null }), boardColumns('EXECUTION', {}), row(), 'RUNNING')).toEqual({ refused: EXECUTION_NOT_DRAGGED })
  })
  it('of a task not on the board, or on a column the board does not draw, is refused', () => {
    expect(dropChange(spec(), typeCols, row({ typeId: 'task' }), 'fixing')).toEqual({ refused: NOT_ON_BOARD })
    expect(dropChange(spec(), typeCols, row(), 'elsewhere')).toEqual({ refused: NOT_A_COLUMN })
  })
})

describe('needs you, on a board', () => {
  it('is an ask, or a failure of open work; never an epic', () => {
    expect(rowNeedsYou(row({ executionState: 'NEEDS_YOU' }))).toBe(true)
    expect(rowNeedsYou(row({ executionState: 'FAILED' }))).toBe(true)
    expect(rowNeedsYou(row({ executionState: 'FAILED', state: 'DONE' }))).toBe(false)
    expect(rowNeedsYou(row({ executionState: 'NEEDS_YOU', typeKind: 'EPIC' }))).toBe(false)
  })
})
