/** The Tasks tool keeps its place in the address, so a task's link opens the project with that task open. */
import { describe, it, expect } from 'vitest'
import { screenOf, taskFileOf, taskLinkInTool } from '../useTasksToolUrl'

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

describe('a task\'s file in the address @SC-1561', () => {
  const file = (q: string) => taskFileOf(new URLSearchParams(q))
  it('names a working file by its path in the task\'s folder, or an attachment by its id', () => {
    expect(file('tool=tasks&task=WEB-42&file=charts/q3.png')).toEqual({ kind: 'working', path: 'charts/q3.png' })
    expect(file('tool=tasks&task=WEB-42&attachment=att1')).toEqual({ kind: 'attachment', id: 'att1' })
    expect(file('tool=tasks&task=WEB-42')).toBeNull()
  })
  it('is nothing without a task: the Files tool keeps `file` for its own', () => {
    expect(file('tool=files&file=notes.md')).toBeNull()
  })
})

describe('a task\'s link, which names no tool @SC-1561', () => {
  it('opens in the Tasks tool with the task and its file', () => {
    expect(taskLinkInTool('?task=WEB-42&file=notes.md')).toBe('?task=WEB-42&file=notes.md&tool=tasks')
  })
  it('leaves an address that names a tool, or no task, as it is', () => {
    expect(taskLinkInTool('?tool=files&file=notes.md')).toBeNull()
    expect(taskLinkInTool('?tool=tasks&task=WEB-42')).toBeNull()
    expect(taskLinkInTool('')).toBeNull()
  })
})
