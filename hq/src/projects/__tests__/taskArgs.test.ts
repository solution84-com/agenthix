import { describe, it, expect } from 'vitest'
import type { CreateTaskArgs } from '@agenthix/core'
import { APPROVAL_COMMENT_PREFIX, createTaskArgs, requireCommentContent, updateTaskArgs } from '../taskArgs'

const base: CreateTaskArgs = { projectId: 'p1', title: 'Ship it' }

describe('the task operations refuse arguments of the wrong kind with a 400 @SC-1142', () => {
  it.each([
    ['no project', { ...base, projectId: '' }],
    ['a title that is not text', { ...base, title: 3 as never }],
    ['an empty title', { ...base, title: '   ' }],
    ['a priority that is none of the three', { ...base, priority: 'urgent' }],
    ['labels that are not words', { ...base, labels: [1] as never }],
    ['a type id that is not text', { ...base, typeId: 5 as never }],
    ['a column id that is not text', { ...base, columnId: 5 as never }],
    ['a state that is none of the four', { ...base, state: 'done' as never }],
  ])('%s', (_what, args) => {
    expect(() => createTaskArgs(args)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  it('keeps only the declared fields, a priority in any case, and reads null as left out', () => {
    const args = { ...base, priority: 'high', typeId: null, columnId: null, assignedAgentId: null, runState: 'RUN_ACTIVE' } as CreateTaskArgs
    expect(createTaskArgs(args)).toEqual({
      projectId: 'p1', title: 'Ship it', priority: 'high',
      description: undefined, typeId: undefined, columnId: undefined, state: undefined, assignedAgentId: undefined, labels: undefined,
    })
  })

  it('takes a task state, and comment text', () => {
    expect(createTaskArgs({ ...base, state: 'IN_PROGRESS' }).state).toBe('IN_PROGRESS')
    expect(() => requireCommentContent({ text: 'x' })).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(requireCommentContent('')).toBe('')
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
  ])('refuses %s', (_what, args) => {
    expect(() => updateTaskArgs(args)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  it('keeps only the checked fields, and tells a field left alone from one cleared', () => {
    // A task's result is its runs' (runResults.ts): an edit that names one sets nothing.
    expect(updateTaskArgs({ taskId: 't1', title: 'New', assignedAgentId: null, result: 'Done', runState: 'RUN_ACTIVE', archived: true })).toEqual({
      taskId: 't1', title: 'New', assignedAgentId: null,
    })
    expect(updateTaskArgs({ taskId: 't1', description: '', priority: 'low', labels: [], status: 'DONE' })).toEqual({
      taskId: 't1', description: '', priority: 'low', labels: [],
    })
    expect(updateTaskArgs({ taskId: 't1' })).toEqual({ taskId: 't1' })
  })

  it('refuses a comment that opens with the marker hq writes a tool request with', () => {
    expect(() => requireCommentContent(`${APPROVAL_COMMENT_PREFIX}{}`)).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => requireCommentContent(`  ${APPROVAL_COMMENT_PREFIX}{}`)).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(requireCommentContent(`see ${APPROVAL_COMMENT_PREFIX}`)).toContain('see')
  })
})
