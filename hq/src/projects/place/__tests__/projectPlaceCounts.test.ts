import { describe, it, expect } from 'vitest'
import { tasksCount, runsCount } from '../projectPlaceCounts'
import { needsYouCount } from '../../pages/toolTaskRows'

describe('tasksCount @SC-1023', () => {
  it('counts the open tasks, leaving out done ones', () => {
    expect(tasksCount([
      { status: 'TODO', runState: 'RUN_NONE' },
      { status: 'IN_PROGRESS', runState: 'RUN_ACTIVE' },
      { status: 'DONE', runState: 'RUN_NONE' },
    ])).toEqual({ count: '2', needsYou: false })
  })

  it('leads with the tasks that need the person', () => {
    expect(tasksCount([
      { status: 'TODO', runState: 'RUN_BLOCKED' },
      { status: 'TODO', runState: 'RUN_NONE' },
    ])).toEqual({ count: '1 needs you · 2', needsYou: true })
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
    { status: 'IN_PROGRESS', runState: 'RUN_BLOCKED', runStateReason: null, assignedAgentId: 'a1' },
    { status: 'DONE', runState: 'RUN_BLOCKED', runStateReason: null, assignedAgentId: 'a1' },
    { status: 'TODO', runState: 'RUN_QUEUED', runStateReason: null, assignedAgentId: null },
    { status: 'TODO', runState: 'RUN_NONE', runStateReason: null, assignedAgentId: 'a1' },
  ]

  it('gives the navigation, and the tool\'s count, the same number', () => {
    expect(needsYouCount(rows)).toBe(3)
    expect(tasksCount(rows).count.startsWith('3 needs you')).toBe(true)
  })
})
