import { describe, it, expect } from 'vitest'
import type { CreateTaskArgs } from '@agenthix/core'
import { APPROVAL_COMMENT_PREFIX, createTaskArgs, isTaskState, requireColumnArg, requireCommentContent, updateTaskArgs } from '../taskArgs'
import { columnOfState, stateOfColumnArg } from '../deprecatedBoardPlace'

const base: CreateTaskArgs = { projectId: 'p1', title: 'Ship it' }

describe('the task operations refuse arguments of the wrong kind with a 400 @SC-1142', () => {
  it.each([
    ['no project', { ...base, projectId: '' }],
    ['a title that is not text', { ...base, title: 3 as never }],
    ['an empty title', { ...base, title: '   ' }],
    ['a priority that is none of the three', { ...base, priority: 'urgent' }],
    ['labels that are not words', { ...base, labels: [1] as never }],
    ['a board id that is not text', { ...base, boardId: 5 as never }],
    ['a column that is not text', { ...base, column: 5 as never }],
  ])('%s', (_what, args) => {
    expect(() => createTaskArgs(args)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  it('keeps only the declared fields, a priority in any case, and reads null as left out', () => {
    const args = { ...base, priority: 'high', boardId: null, column: null, assignedAgentId: null, runState: 'RUN_ACTIVE' } as CreateTaskArgs
    expect(createTaskArgs(args)).toEqual({
      projectId: 'p1', title: 'Ship it', priority: 'high',
      description: undefined, typeId: undefined, columnId: undefined, state: undefined, assignedAgentId: undefined, labels: undefined,
    })
  })

  it('reads a deprecated column as the state it stands for, unless the task model\'s place is given (adr-0176)', () => {
    expect(createTaskArgs({ ...base, column: 'in_progress' }).state).toBe('IN_PROGRESS')
    expect(createTaskArgs({ ...base, column: 'Done' }).state).toBe('DONE')
    expect(createTaskArgs({ ...base, column: 'review' }).state).toBe('BACKLOG')
    expect(createTaskArgs({ ...base, column: 'done', state: 'TODO' }).state).toBe('TODO')
    expect(createTaskArgs({ ...base, column: 'done', columnId: 'c1' }).state).toBeUndefined()
    expect(createTaskArgs({ ...base, boardId: 'b1' })).not.toHaveProperty('boardId')
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

describe('a task on no board answers the deprecated board place from its state (adr-0176)', () => {
  it('names the old default column of each state, and none in Backlog', () => {
    expect(columnOfState('BACKLOG')).toBeNull()
    expect(columnOfState('TODO')).toBe('todo')
    expect(columnOfState('IN_PROGRESS')).toBe('in_progress')
    expect(columnOfState('DONE')).toBe('done')
  })
  it('reads a column argument by the old names or the state, in any case; null is Backlog; anything else is not known', () => {
    expect(stateOfColumnArg(null)).toBe('BACKLOG')
    expect(stateOfColumnArg('TODO')).toBe('TODO')
    expect(stateOfColumnArg('In progress')).toBe('IN_PROGRESS')
    expect(stateOfColumnArg('done')).toBe('DONE')
    expect(stateOfColumnArg('review')).toBeUndefined()
  })
})
