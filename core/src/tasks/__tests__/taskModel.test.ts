import { describe, expect, it } from 'vitest'
import {
  TASK_STATES, defaultColumnFor, isTaskState, stateOnSprintAdd, typeColumnProblems, type TypeColumnDefinition,
} from '../taskModel.js'
import { BUILT_IN_BOARDS, builtInTaskTypes, stateColumns } from '../defaults.js'
import { BOARD_DROP_SETS, boardDefinitionProblems, parseBoardFilter } from '../boardModel.js'

const col = (name: string, state: TypeColumnDefinition['state'], defaultForState = false): TypeColumnDefinition =>
  ({ name, colour: 'neutral', state, defaultForState })

describe('the task state', () => {
  it('is Backlog first, then To do, In progress and Done', () => {
    expect([...TASK_STATES]).toEqual(['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'])
    expect(isTaskState('BACKLOG')).toBe(true)
    expect(isTaskState('todo')).toBe(false)
  })

  it('moves a Backlog task to To do when it is added to a sprint, and keeps any other (N1)', () => {
    expect(stateOnSprintAdd('BACKLOG')).toBe('TODO')
    for (const s of ['TODO', 'IN_PROGRESS', 'DONE'] as const) expect(stateOnSprintAdd(s)).toBe(s)
  })
})

describe('a type\'s columns', () => {
  it('pass with one default column in every state', () => {
    expect(typeColumnProblems(stateColumns())).toEqual([])
    expect(typeColumnProblems([col('Reported', 'BACKLOG', true), col('Triaged', 'TODO', true), col('Fixing', 'IN_PROGRESS', true),
      col('Testing', 'IN_PROGRESS'), col('Verified', 'DONE', true)])).toEqual([])
  })

  it('fail when a state has no column, or not exactly one default', () => {
    expect(typeColumnProblems([col('A', 'BACKLOG', true), col('B', 'TODO', true), col('C', 'IN_PROGRESS', true)]))
      .toEqual(['Done needs at least one column.'])
    expect(typeColumnProblems([...stateColumns(), col('Testing', 'IN_PROGRESS', true)]))
      .toEqual(['In progress needs exactly one default column.'])
  })

  it('fail on two columns of one name, whatever their case, and on an empty name', () => {
    expect(typeColumnProblems([...stateColumns(), col('done', 'DONE')])).toContain('Two columns are named "done".')
    expect(typeColumnProblems([...stateColumns(), col('  ', 'TODO')])).toContain('A column\'s name is 1 to 40 characters.')
  })

  it('land a task on its state\'s default column', () => {
    const columns = [
      { ...col('Fixing', 'IN_PROGRESS'), order: 2 },
      { ...col('Testing', 'IN_PROGRESS', true), order: 3 },
      { ...col('Triaged', 'TODO', true), order: 1 },
    ]
    expect(defaultColumnFor(columns, 'IN_PROGRESS')?.name).toBe('Testing')
    expect(defaultColumnFor(columns, 'DONE')).toBeNull()
  })
})

describe('every project\'s own types and boards', () => {
  it('are Task and Epic, each with the four states as its columns', () => {
    const types = builtInTaskTypes()
    expect(types.map(t => [t.name, t.kind])).toEqual([['Task', 'TASK'], ['Epic', 'EPIC']])
    for (const t of types) {
      expect(t.columns.map(c => [c.name, c.state])).toEqual([['Backlog', 'BACKLOG'], ['To do', 'TODO'], ['In progress', 'IN_PROGRESS'], ['Done', 'DONE']])
      expect(typeColumnProblems(t.columns)).toEqual([])
    }
  })

  it('are a fresh copy each time, so a caller changing one changes no other', () => {
    builtInTaskTypes()[0]!.columns[0]!.name = 'Changed'
    expect(builtInTaskTypes()[0]!.columns[0]!.name).toBe('Backlog')
  })

  it('include the task state and execution boards', () => {
    expect(BUILT_IN_BOARDS.map(b => b.kind)).toEqual(['STATE', 'EXECUTION'])
  })
})

describe('a board', () => {
  it('sets a column, the state or a field\'s value on a drop, and nothing on the execution board', () => {
    expect(BOARD_DROP_SETS).toEqual({ TYPE: 'column', STATE: 'state', EXECUTION: null, FIELD: 'fieldValue' })
  })

  it('names a type only on a TYPE board and a field only on a FIELD board', () => {
    expect(boardDefinitionProblems({ kind: 'TYPE', typeId: 't', fieldId: null })).toEqual([])
    expect(boardDefinitionProblems({ kind: 'TYPE', typeId: null, fieldId: null })).toHaveLength(1)
    expect(boardDefinitionProblems({ kind: 'FIELD', typeId: null, fieldId: 'f' })).toEqual([])
    expect(boardDefinitionProblems({ kind: 'FIELD', typeId: 't', fieldId: 'f' })).toHaveLength(1)
    expect(boardDefinitionProblems({ kind: 'STATE', typeId: null, fieldId: null })).toEqual([])
    expect(boardDefinitionProblems({ kind: 'EXECUTION', typeId: 't', fieldId: null })).toHaveLength(1)
  })

  it('reads its filter, dropping what is not a filter part', () => {
    expect(parseBoardFilter({ sprint: { current: true }, epicId: 'e1', agentId: 'a1', colour: 'x' }))
      .toEqual({ sprint: { current: true }, epicId: 'e1', agentId: 'a1' })
    expect(parseBoardFilter({ sprint: { sprintId: 's1' } })).toEqual({ sprint: { sprintId: 's1' } })
    expect(parseBoardFilter({ sprint: { none: true }, typeId: 't1' })).toEqual({ sprint: { none: true }, typeId: 't1' })
    expect(parseBoardFilter({ sprint: { none: 'yes' }, typeId: '' })).toEqual({})
    expect(parseBoardFilter({ sprint: 'current', epicId: 3, agentId: '' })).toEqual({})
    for (const raw of [null, 'x', [], 1]) expect(parseBoardFilter(raw)).toEqual({})
  })
})
