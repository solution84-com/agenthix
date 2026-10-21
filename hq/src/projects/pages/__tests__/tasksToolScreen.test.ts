/** The Tasks tool keeps its place in the address, so a task's link opens the project with that task open. */
import { describe, it, expect } from 'vitest'
import { screenOf } from '../useTasksToolUrl'

const of = (q: string) => screenOf(new URLSearchParams(q))

describe('screenOf @SC-514 @SC-515', () => {
  it('is the list when nothing else is asked for', () => {
    expect(of('tool=tasks')).toEqual({ kind: 'list' })
  })
  it('opens the backlog and done views', () => {
    expect(of('tool=tasks&view=backlog')).toEqual({ kind: 'backlog' })
    expect(of('tool=tasks&view=done')).toEqual({ kind: 'done' })
  })
  it('opens a task, at its waiting item when asked, and its session', () => {
    expect(of('tool=tasks&task=WEB-27')).toEqual({ kind: 'task', taskKey: 'WEB-27', atWaiting: false })
    expect(of('tool=tasks&task=WEB-27&at=waiting')).toEqual({ kind: 'task', taskKey: 'WEB-27', atWaiting: true })
    expect(of('tool=tasks&task=WEB-27&view=session')).toEqual({ kind: 'session', taskKey: 'WEB-27' })
  })
})
