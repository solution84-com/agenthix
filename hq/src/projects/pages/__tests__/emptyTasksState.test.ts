import { describe, it, expect } from 'vitest'
import { emptyTasksState } from '../emptyTasksState'

describe('the Tasks tool of a project with no tasks', () => {
  it('says so and opens the quick-add box for someone who can add', () => {
    const s = emptyTasksState({ loaded: true, taskCount: 0, canStart: true })
    expect(s.text).toMatch(/^No tasks yet/)
    expect(s.quickAddOpen).toBe(true)
  })

  it('says so without a box for a Viewer', () => {
    expect(emptyTasksState({ loaded: true, taskCount: 0, canStart: false })).toEqual({ text: 'No tasks yet.', quickAddOpen: false })
  })

  it('leaves the usual list alone while loading or once there are tasks', () => {
    expect(emptyTasksState({ loaded: false, taskCount: 0, canStart: true })).toEqual({ text: null, quickAddOpen: false })
    expect(emptyTasksState({ loaded: true, taskCount: 2, canStart: true })).toEqual({ text: null, quickAddOpen: false })
  })
})
