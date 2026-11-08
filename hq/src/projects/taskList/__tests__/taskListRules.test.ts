/** The task lists' rules: the card each task counts under, the counts and the orders. Never a run state (D9). */
import { describe, it, expect } from 'vitest'
import { compareRows, countRows, hasNoAgent, isLate, matchesSearch, onCard, searchedNumber, type CardFields, type SortFields } from '../taskListRules'

const TODAY = '2026-11-07'
const task = (over: Partial<CardFields> = {}): CardFields => ({ state: 'TODO', due: null, agentId: 'a1', ...over })

describe('where a task is counted', () => {
  it('counts each task under its task state, and also as Late or No agent', () => {
    const rows = [
      task({ state: 'BACKLOG', agentId: null }),
      task({ state: 'TODO', due: '2026-11-06' }),
      task({ state: 'IN_PROGRESS' }),
      task({ state: 'DONE', due: '2026-11-01', agentId: null }),
    ]
    expect(countRows(rows, TODAY)).toEqual({ all: 4, backlog: 1, todo: 1, inProgress: 1, done: 1, late: 1, noAgent: 1 })
  })

  it('is late only when due before today and not done', () => {
    expect(isLate(task({ due: '2026-11-06' }), TODAY)).toBe(true)
    expect(isLate(task({ due: TODAY }), TODAY)).toBe(false)
    expect(isLate(task({ due: '2026-11-06', state: 'DONE' }), TODAY)).toBe(false)
    expect(isLate(task(), TODAY)).toBe(false)
  })

  it('has no agent only while it is open', () => {
    expect(hasNoAgent(task({ agentId: null }))).toBe(true)
    expect(hasNoAgent(task({ agentId: null, state: 'DONE' }))).toBe(false)
  })

  it('puts a task on the card of its state, and on Late and No agent by their rule', () => {
    expect(onCard(task({ state: 'IN_PROGRESS' }), 'inProgress', TODAY)).toBe(true)
    expect(onCard(task({ state: 'IN_PROGRESS' }), 'todo', TODAY)).toBe(false)
    expect(onCard(task({ due: '2026-11-01' }), 'late', TODAY)).toBe(true)
    expect(onCard(task({ agentId: null }), 'noAgent', TODAY)).toBe(true)
  })
})

const row = (over: Partial<SortFields>): SortFields => ({
  rank: null, priority: 'MEDIUM', due: null, updatedAt: new Date('2026-11-01'), createdAt: new Date('2026-10-01'), number: 1, ...over,
})
const order = (rows: SortFields[], sort: Parameters<typeof compareRows>[0]) => [...rows].sort(compareRows(sort)).map(r => r.number)

describe('the orders', () => {
  it('Rank is the project’s one order, compared as text; an unplaced task goes last, then by number', () => {
    expect(order([row({ number: 1, rank: 'm' }), row({ number: 2, rank: 'b' }), row({ number: 3 }), row({ number: 4, rank: 'b0' })], 'rank'))
      .toEqual([2, 4, 1, 3])
  })

  it('Due date puts the soonest first and no date last, broken by rank', () => {
    expect(order([row({ number: 1 }), row({ number: 2, due: '2026-11-12' }), row({ number: 3, due: '2026-11-08', rank: 'b' }), row({ number: 4, due: '2026-11-08', rank: 'a' })], 'due'))
      .toEqual([4, 3, 2, 1])
  })

  it('Priority puts High first; Recently updated and Newest go by their dates', () => {
    expect(order([row({ number: 1, priority: 'LOW' }), row({ number: 2, priority: 'HIGH' })], 'priority')).toEqual([2, 1])
    expect(order([row({ number: 1 }), row({ number: 2, updatedAt: new Date('2026-11-05') })], 'updated')).toEqual([2, 1])
    expect(order([row({ number: 1 }), row({ number: 2, createdAt: new Date('2026-10-05') })], 'newest')).toEqual([2, 1])
  })
})

describe('the search', () => {
  it('matches words in the title, or the key or number', () => {
    expect(matchesSearch({ title: 'Write the home page copy', number: 2, projectKey: 'WEB' }, 'home')).toBe(true)
    expect(matchesSearch({ title: 'x', number: 12, projectKey: 'WEB' }, 'web-12')).toBe(true)
    expect(searchedNumber('INT-12', 'WEB')).toBeNull()
  })
})
