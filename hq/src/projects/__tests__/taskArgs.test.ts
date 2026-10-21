import { describe, it, expect } from 'vitest'
import type { CreateTaskArgs } from '@agenthix/core'
import { createTaskArgs, isTaskState, requireColumnArg, requireCommentContent } from '../taskArgs'

const base: CreateTaskArgs = { projectId: 'p1', title: 'Ship it' }

describe('the task operations refuse arguments of the wrong kind with a 400 @SC-1142', () => {
  it.each([
    ['no project', { ...base, projectId: '' }],
    ['a title that is not text', { ...base, title: 3 as never }],
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
