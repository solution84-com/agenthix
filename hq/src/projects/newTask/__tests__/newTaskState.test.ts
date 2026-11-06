import { describe, it, expect } from 'vitest'
import { canCreate, emptyNewTask, freshAfterCreate, showsColumn, showsModel, withChange, type BoardChoice } from '../newTaskState'

const boards: BoardChoice[] = [
  { id: 'b1', name: 'Sprint', columns: [
    { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', order: 1 },
    { name: 'todo', label: 'To do', status: 'TODO', order: 0 },
  ] },
  { id: 'b2', name: 'Other', columns: [{ name: 'later', label: 'Later', status: 'TODO', order: 0 }] },
]

describe('a new task', () => {
  it('shows the model only once an agent is chosen, and drops it with the agent', () => {
    let v = emptyNewTask({}, boards)
    expect(showsModel(v)).toBe(false)
    v = withChange(v, { agentId: 'a1' }, boards)
    expect(showsModel(v)).toBe(true)
    v = withChange(v, { modelChoice: 'p/opus' }, boards)
    v = withChange(v, { agentId: 'a2' }, boards)
    expect(v.modelChoice).toBe('')
    expect(showsModel(withChange(v, { agentId: '' }, boards))).toBe(false)
  })

  it('shows the column only with a board, starting in its first To do column', () => {
    let v = emptyNewTask({}, boards)
    expect(showsColumn(v)).toBe(false)
    expect(v.column).toBe('')
    v = withChange(v, { boardId: 'b1' }, boards)
    expect(showsColumn(v)).toBe(true)
    expect(v.column).toBe('todo')
    v = withChange(v, { boardId: '' }, boards)
    expect(v.column).toBe('')
  })

  it('takes the epic, board and column from the address', () => {
    const v = emptyNewTask({ epicId: 'e1', boardId: 'b1', column: 'doing' }, boards)
    expect(v).toMatchObject({ epicId: 'e1', boardId: 'b1', column: 'doing' })
    expect(emptyNewTask({ boardId: 'b1', column: 'gone' }, boards).column).toBe('todo')
  })

  it('needs a title only', () => {
    expect(canCreate(emptyNewTask())).toBe(false)
    expect(canCreate({ ...emptyNewTask(), title: '  ' })).toBe(false)
    expect(canCreate({ ...emptyNewTask(), title: 'Ship' })).toBe(true)
  })

  it('starts the next one fresh on the same board and epic', () => {
    const v = { ...emptyNewTask({ epicId: 'e1', boardId: 'b2' }, boards), title: 'One', agentId: 'a1', description: 'text' }
    const next = freshAfterCreate(v, { epicId: 'e1' }, boards)
    expect(next).toMatchObject({ title: '', description: '', agentId: '', epicId: 'e1', boardId: 'b2', column: 'later' })
  })
})
