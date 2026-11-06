import { describe, it, expect } from 'vitest'
import type { CreateTaskArgs } from '@agenthix/core'
import { APPROVAL_COMMENT_PREFIX, createTaskArgs, isTaskState, requireColumnArg, requireCommentContent, updateTaskArgs } from '../taskArgs'
import { placeForState } from '../taskStatusChange'

const base: CreateTaskArgs = { projectId: 'p1', title: 'Ship it' }

describe('the task operations refuse arguments of the wrong kind with a 400 @SC-1142', () => {
  it.each([
    ['no project', { ...base, projectId: '' }],
    ['a title that is not text', { ...base, title: 3 as never }],
    ['an empty title', { ...base, title: '   ' }],
    ['a priority that is none of the three', { ...base, priority: 'urgent' }],
    ['labels that are not words', { ...base, labels: [1] as never }],
    ['a board id that is not text', { ...base, boardId: 5 as never }],
  ])('%s', (_what, args) => {
    expect(() => createTaskArgs(args)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  it('keeps only the declared fields, a priority in any case, and reads null as left out', () => {
    const args = { ...base, priority: 'high', boardId: null, column: null, assignedAgentId: null, runState: 'RUN_ACTIVE' } as CreateTaskArgs
    expect(createTaskArgs(args)).toEqual({
      projectId: 'p1', title: 'Ship it', priority: 'high',
      description: undefined, boardId: undefined, column: undefined, assignedAgentId: undefined, labels: undefined,
    })
  })

  it('takes a column name or null for the Backlog, and comment text', () => {
    expect(requireColumnArg(null)).toBeNull()
    expect(requireColumnArg('todo')).toBe('todo')
    expect(() => requireColumnArg(undefined)).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => requireCommentContent({ text: 'x' })).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(requireCommentContent('')).toBe('')
  })

  it('knows the three task states', () => {
    expect(['TODO', 'IN_PROGRESS', 'DONE'].every(isTaskState)).toBe(true)
    expect(isTaskState('todo')).toBe(false)
  })
})

describe('an edit of a task is checked as a new task is (F-hq-6-03)', () => {
  it.each([
    ['no task', { title: 'x' }],
    ['an empty title', { taskId: 't1', title: ' ' }],
    ['a title that is not text', { taskId: 't1', title: 3 }],
    ['a description that is not text', { taskId: 't1', description: 3 }],
    ['a priority that is none of the three', { taskId: 't1', priority: 'urgent' }],
    ['labels that are not words', { taskId: 't1', labels: [1] }],
    ['a state that is none of the three', { taskId: 't1', status: 'BLOCKED' }],
    ['a state in lower case', { taskId: 't1', status: 'done' }],
  ])('refuses %s', (_what, args) => {
    expect(() => updateTaskArgs(args)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  it('keeps only the checked fields, and tells a field left alone from one cleared', () => {
    // A task's result is its runs' (runResults.ts): an edit that names one sets nothing.
    expect(updateTaskArgs({ taskId: 't1', title: 'New', assignedAgentId: null, result: 'Done', runState: 'RUN_ACTIVE', archived: true })).toEqual({
      taskId: 't1', title: 'New', assignedAgentId: null,
    })
    expect(updateTaskArgs({ taskId: 't1', description: '', priority: 'low', labels: [], status: 'DONE' })).toEqual({
      taskId: 't1', description: '', priority: 'low', labels: [], status: 'DONE',
    })
    expect(updateTaskArgs({ taskId: 't1' })).toEqual({ taskId: 't1' })
  })

  it('refuses a comment that opens with the marker hq writes a tool request with', () => {
    expect(() => requireCommentContent(`${APPROVAL_COMMENT_PREFIX}{}`)).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => requireCommentContent(`  ${APPROVAL_COMMENT_PREFIX}{}`)).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(requireCommentContent(`see ${APPROVAL_COMMENT_PREFIX}`)).toContain('see')
  })
})

describe('a state is reached by a move into a column (F-hq-6-03)', () => {
  const columns = [
    { name: 'later', label: 'Later', status: 'IN_PROGRESS', order: 2, color: '#000' },
    { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', order: 1, color: '#000' },
    { name: 'done', label: 'Done', status: 'DONE', order: 3, color: '#000' },
  ]
  it('goes to the first column of that state, in the board\'s order', () => {
    expect(placeForState(columns, 'IN_PROGRESS')).toEqual({ column: 'doing' })
    expect(placeForState(columns, 'DONE')).toEqual({ column: 'done' })
  })
  it('goes to the Backlog for To do when no column has it, and is refused for any other state with none', () => {
    expect(placeForState(columns, 'TODO')).toEqual({ column: null })
    expect(() => placeForState(columns.slice(0, 2), 'DONE')).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
