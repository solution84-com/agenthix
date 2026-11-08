import { describe, it, expect } from 'vitest'
import { tasksCount, runsCount } from '../projectPlaceCounts'
import { needsYouCount } from '../../pages/toolTaskRows'

describe('tasksCount @SC-1023', () => {
  const now = new Date('2026-11-07T12:00:00Z')
  it('is the Tasks list’s All: open tasks and those done in the last 30 days, none archived', () => {
    expect(tasksCount([
      { state: 'TODO' },
      { state: 'IN_PROGRESS' },
      { state: 'DONE', doneAt: '2026-11-01T00:00:00Z' },
      { state: 'DONE', doneAt: '2026-09-01T00:00:00Z' },
      { state: 'BACKLOG', archived: true },
    ], now)).toBe('3')
  })

  it('never carries a run state: a task that needs the person is counted as any other', () => {
    expect(tasksCount([{ state: 'TODO' }, { state: 'TODO' }], now)).toBe('2')
  })
})

describe('runsCount @SC-1023', () => {
  it('says how many are running', () => {
    expect(runsCount([{}, {}])).toBe('2 running')
  })

  it('says nothing when none are, or when it is not known', () => {
    expect(runsCount([])).toBeUndefined()
    expect(runsCount(undefined)).toBeUndefined()
  })
})

describe('needs you, counted once @SC-517', () => {
  const rows = [
    { state: 'IN_PROGRESS', runState: 'RUN_BLOCKED', runStateReason: null, assignedAgentId: 'a1' },
    { state: 'DONE', runState: 'RUN_BLOCKED', runStateReason: null, assignedAgentId: 'a1' },
    { state: 'TODO', runState: 'RUN_QUEUED', runStateReason: null, assignedAgentId: null },
    { state: 'TODO', runState: 'RUN_NONE', runStateReason: null, assignedAgentId: 'a1' },
  ]

  it('gives the navigation its number', () => {
    expect(needsYouCount(rows)).toBe(3)
  })
})
