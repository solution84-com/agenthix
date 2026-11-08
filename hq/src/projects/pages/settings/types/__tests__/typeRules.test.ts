/** Settings › Task types: what each type's ⋯ offers and why something is greyed, and a column's moves (spec D10, D12). */
import { describe, expect, it } from 'vitest'
import type { TaskTypeUse } from '../../../../taskTypeUse'
import {
  BUILT_IN_KEPT, OPEN_TASKS_KEEP_IT, ONLY_NEVER_USED, VIEWER_CANNOT_CHANGE_TYPES, columnRemoveWhy, droppedBefore, moveColumnWords,
  movedWithinState, otherStatesHint, typeMenu, typeSubline,
} from '../typeRules'

const use = (over: Partial<TaskTypeUse> = {}): TaskTypeUse => ({ typeId: 't', tasks: 0, open: 0, used: false, madeFrom: null, columns: {}, ...over })
const custom = { kind: 'CUSTOM' as const, archivedAt: null }

describe('a type in the list', () => {
  it('says Task and Epic are built in, and where a template type came from', () => {
    expect(typeSubline({ kind: 'TASK', archivedAt: null }, use())).toBe('Built in · New task starts here')
    expect(typeSubline({ kind: 'EPIC', archivedAt: null }, use({ tasks: 2 }), true)).toBe('Built in · groups tasks, never run · 2 tasks')
    expect(typeSubline(custom, use({ madeFrom: { title: 'Content pipeline', version: '1.1.0' } }))).toBe('From the Library: Content pipeline 1.1.0')
    expect(typeSubline({ kind: 'CUSTOM', archivedAt: new Date() }, use({ tasks: 1 }), true)).toBe('Made in this project · Archived · 1 task')
  })

  it('never offers to archive Task or Epic, and greys their Delete with why', () => {
    expect(typeMenu({ kind: 'TASK', archivedAt: null }, use(), true)).toEqual([
      { action: 'edit', label: 'Edit columns', disabledWhy: undefined },
      { action: 'delete', label: 'Delete', disabledWhy: BUILT_IN_KEPT },
    ])
  })

  it('greys Archive while open tasks use the type, and Delete once anything has', () => {
    const items = typeMenu(custom, use({ open: 3, used: true }), true)
    expect(items.find(i => i.action === 'archive')?.disabledWhy).toBe(OPEN_TASKS_KEEP_IT)
    expect(items.find(i => i.action === 'delete')?.disabledWhy).toBe(ONLY_NEVER_USED)
    const fresh = typeMenu(custom, use(), true)
    expect(fresh.every(i => i.disabledWhy === undefined)).toBe(true)
  })

  it('offers an archived type back, and greys everything for a Viewer', () => {
    expect(typeMenu({ kind: 'CUSTOM', archivedAt: new Date() }, use(), true).map(i => i.action)).toEqual(['edit', 'restore', 'delete'])
    expect(typeMenu(custom, use(), false).every(i => i.disabledWhy === VIEWER_CANNOT_CHANGE_TYPES)).toBe(true)
  })
})

describe("a type's columns", () => {
  const columns = [
    { id: 'a', name: 'Submitted', state: 'BACKLOG' as const },
    { id: 'b', name: 'Accepted', state: 'TODO' as const },
    { id: 'c', name: 'Building', state: 'IN_PROGRESS' as const },
    { id: 'd', name: 'Testing', state: 'IN_PROGRESS' as const },
    { id: 'e', name: 'Shipped', state: 'DONE' as const },
  ]

  it('keeps the last column of a state, and one that holds tasks', () => {
    expect(columnRemoveWhy(columns[4]!, columns, 0)).toBe('Each state needs a column: a task set to Done lands on it.')
    expect(columnRemoveWhy(columns[3]!, columns, 2)).toBe('It holds 2 tasks: move them to another column first.')
    expect(columnRemoveWhy(columns[3]!, columns, 0)).toBeNull()
  })

  it('moves a column up or down only within its state', () => {
    expect(movedWithinState(columns, 'd', -1)).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(movedWithinState(columns, 'c', -1)).toBeNull()
    expect(movedWithinState(columns, 'd', 1)).toBeNull()
  })

  it('drops a dragged column before another of its state, or at its end', () => {
    expect(droppedBefore(columns, 'd', 'c', 'IN_PROGRESS')).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(droppedBefore(columns, 'c', null, 'IN_PROGRESS')).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(droppedBefore(columns, 'd', null, 'IN_PROGRESS')).toBeNull()
    expect(droppedBefore(columns, 'a', 'c', 'IN_PROGRESS')).toBeNull()
  })

  it('says which states a column can go to and what happens to its tasks', () => {
    expect(otherStatesHint(columns[3]!)).toBe('Backlog, To do or Done: the states Testing is not in.')
    expect(moveColumnWords(columns[3]!, 'DONE', [{ key: 'WEB-48', title: 'Share buttons on posts' }]))
      .toBe('Its 1 task will be Done: WEB-48 Share buttons on posts. Done always means done.')
    expect(moveColumnWords(columns[3]!, 'TODO', [])).toBe("It holds no tasks, so no task's state changes.")
  })
})
