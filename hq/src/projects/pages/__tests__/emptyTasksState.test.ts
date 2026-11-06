import { describe, it, expect } from 'vitest'
import { emptyTasksState } from '../emptyTasksState'

describe('the Tasks tool of a project with no tasks', () => {
  it('says so and offers New task to someone who can add one', () => {
    expect(emptyTasksState({ loaded: true, taskCount: 0, narrowed: false, canStart: true })).toEqual({ text: 'No tasks yet.', newTask: true })
  })

  it('says so without New task for a Viewer', () => {
    expect(emptyTasksState({ loaded: true, taskCount: 0, narrowed: false, canStart: false })).toEqual({ text: 'No tasks yet.', newTask: false })
  })

  it('says nothing matches when a filter, a scorecard or a search leaves no row', () => {
    expect(emptyTasksState({ loaded: true, taskCount: 0, narrowed: true, canStart: true })).toEqual({ text: 'No task matches.', newTask: false })
  })

  it('leaves the usual list alone while loading or once there are tasks', () => {
    expect(emptyTasksState({ loaded: false, taskCount: 0, narrowed: false, canStart: true })).toEqual({ text: null, newTask: false })
    expect(emptyTasksState({ loaded: true, taskCount: 2, narrowed: false, canStart: true })).toEqual({ text: null, newTask: false })
  })
})
