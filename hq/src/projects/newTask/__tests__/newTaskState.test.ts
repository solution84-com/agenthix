import { describe, it, expect } from 'vitest'
import type { TaskState, TaskTypeView } from '@agenthix/core'
import { canCreate, emptyNewTask, freshAfterCreate, showsModel, showsRunFacts, withChange } from '../newTaskState'

const type = (id: string, kind: TaskTypeView['kind'], names: string[], archivedAt: Date | null = null): TaskTypeView => ({
  id, projectId: 'p', name: id, icon: 'task', kind, madeFromVersionId: null, archivedAt,
  columns: names.map((name, order) => ({
    id: `${id}-${order}`, typeId: id, name, colour: 'neutral', order, defaultForState: true,
    state: (['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'] as TaskState[])[order],
  })),
})
const types = [
  type('old', 'CUSTOM', ['B', 'T', 'I', 'D'], new Date()),
  type('task', 'TASK', ['Backlog', 'To do', 'In progress', 'Done']),
  type('bug', 'CUSTOM', ['Reported', 'Triaged', 'Fixing', 'Verified']),
  type('epic', 'EPIC', ['Backlog', 'To do', 'In progress', 'Done']),
]

describe('a new task', () => {
  it('is a Task in its type’s Backlog until another type or column is asked for (D11, N2)', () => {
    expect(emptyNewTask({}, types)).toMatchObject({ typeId: 'task', columnId: '' })
    expect(emptyNewTask({ typeId: 'bug' }, types)).toMatchObject({ typeId: 'bug', columnId: '' })
    // A board's column names its type.
    expect(emptyNewTask({ columnId: 'bug-2' }, types)).toMatchObject({ typeId: 'bug', columnId: 'bug-2' })
    expect(emptyNewTask({ typeId: 'task', columnId: 'bug-2' }, types).columnId).toBe('')
    expect(emptyNewTask({ typeId: 'old' }, types).typeId).toBe('task')
    expect(emptyNewTask({}, []).typeId).toBe('')
  })

  it('shows the model only once an agent is chosen, and drops it with the agent', () => {
    let v = emptyNewTask({}, types)
    expect(showsModel(types, v)).toBe(false)
    v = withChange(v, { agentId: 'a1' }, types)
    expect(showsModel(types, v)).toBe(true)
    v = withChange(v, { modelChoice: 'p/opus' }, types)
    v = withChange(v, { agentId: 'a2' }, types)
    expect(v.modelChoice).toBe('')
  })

  it('keeps an epic’s agent, to manage it, and drops what an epic never has (D12)', () => {
    let v = { ...emptyNewTask({ epicId: 'e1' }, types), agentId: 'a1', modelChoice: 'p/opus', startsAt: '2030-01-02T09:00' }
    v = withChange(v, { typeId: 'epic' }, types)
    expect(v).toMatchObject({ agentId: 'a1', modelChoice: '', startsAt: '', epicId: '' })
    expect(showsRunFacts(types, v)).toBe(false)
    expect(showsModel(types, v)).toBe(false)
  })

  it('drops a column that is not one of the new type’s own', () => {
    const v = withChange(emptyNewTask({ columnId: 'bug-2' }, types), { typeId: 'task' }, types)
    expect(v.columnId).toBe('')
  })

  it('needs a title and a type', () => {
    expect(canCreate(emptyNewTask({}, types))).toBe(false)
    expect(canCreate({ ...emptyNewTask({}, types), title: '  ' })).toBe(false)
    expect(canCreate({ ...emptyNewTask({}, types), title: 'Ship' })).toBe(true)
    expect(canCreate({ ...emptyNewTask({}, []), title: 'Ship' })).toBe(false)
  })

  it('starts the next one fresh, of the same type, in the same column and epic', () => {
    const v = { ...emptyNewTask({ epicId: 'e1', columnId: 'bug-2' }, types), title: 'One', agentId: 'a1', description: 'text' }
    expect(freshAfterCreate(v, {}, types)).toMatchObject({ title: '', description: '', agentId: '', epicId: 'e1', typeId: 'bug', columnId: 'bug-2' })
  })
})
