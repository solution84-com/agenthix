import { describe, it, expect } from 'vitest'
import { taskStateWords, type TaskStateKind } from '@agenthix/ui/tasks'
import {
  compareRows, countRows, epicRank, importanceRank, listStateOf, matchesSearch, searchedNumber,
  type ListState, type SortFields, type StateFields,
} from '../taskListRules'
import { MANIFEST_BLOCKED_REASON, NO_AGENT_REASON } from '../../../agents/taskExecutionReasons'

const ME = 'me'
const base: StateFields = {
  status: 'TODO', runState: 'RUN_NONE', runStateReason: null, assignedAgentId: 'agent', onBehalfOfUserId: ME,
  runCount: 0, isEpic: false,
}
const state = (patch: Partial<StateFields>, viewer = ME) => listStateOf({ ...base, ...patch }, viewer)

describe('where a task stands for the reader', () => {
  it('reads an approval on the reader’s behalf as Needs you, and anyone else’s as Waiting on them', () => {
    const blocked = { runState: 'RUN_BLOCKED', runStateReason: `${MANIFEST_BLOCKED_REASON}: write` }
    expect(state(blocked)).toEqual({ card: 'needsYou', why: 'okay' })
    expect(state({ ...blocked, onBehalfOfUserId: 'sam' })).toEqual({ card: 'waiting', onUserId: 'sam' })
  })

  it('reads a failure, and work with no agent to start it, as Needs you', () => {
    expect(state({ runState: 'RUN_FAILED', runStateReason: 'model overloaded' })).toEqual({ card: 'needsYou', why: 'failed' })
    expect(state({ runState: 'RUN_BLOCKED', runStateReason: 'something else' })).toEqual({ card: 'needsYou', why: 'failed' })
    expect(state({ runState: 'RUN_QUEUED', assignedAgentId: null })).toEqual({ card: 'needsYou', why: 'noAgent' })
    expect(state({ runStateReason: NO_AGENT_REASON, assignedAgentId: null })).toEqual({ card: 'needsYou', why: 'noAgent' })
  })

  it('reads running, waiting, not started, finished and done', () => {
    expect(state({ runState: 'RUN_ACTIVE' })).toEqual({ card: 'running' })
    expect(state({ runState: 'RUN_QUEUED' })).toEqual({ card: 'waiting', onUserId: null })
    expect(state({ runState: 'RUN_THROTTLED' })).toEqual({ card: 'waiting', onUserId: null })
    expect(state({})).toEqual({ card: 'notStarted' })
    expect(state({ runCount: 2 })).toEqual({ card: 'done', finished: true })
    expect(state({ status: 'DONE', runState: 'RUN_BLOCKED' })).toEqual({ card: 'done', finished: false })
  })

  it('gives an open epic no card, and a done one Done', () => {
    expect(state({ isEpic: true })).toEqual({ card: null })
    expect(state({ isEpic: true, status: 'DONE' })).toEqual({ card: 'done', finished: false })
  })

  // The card and the words a row shows (taskStateWords, T1) are one answer.
  const CARD_OF_KIND: Record<TaskStateKind, string> = {
    okay: 'needsYou', question: 'needsYou', failed: 'needsYou', running: 'running', waiting: 'waiting',
    notStarted: 'notStarted', finished: 'done', done: 'done',
  }
  const REASONS = [null, `${MANIFEST_BLOCKED_REASON}: x`, 'something else']
  for (const status of ['TODO', 'IN_PROGRESS', 'DONE']) for (const runState of ['RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED'])
    for (const runStateReason of REASONS) for (const runCount of [0, 1]) {
      it(`agrees with the state words: ${status} ${runState} ${runStateReason ?? '-'} runs ${runCount}`, () => {
        const s = state({ status, runState, runStateReason, runCount })
        const words = taskStateWords({ runState, runStateReason, done: status === 'DONE', latestRunCompleted: runCount > 0 })
        expect(s.card as string | null).toBe(CARD_OF_KIND[words.kind])
      })
    }
})

const row = (patch: Partial<SortFields>): SortFields => ({
  rank: 4, priority: 'MEDIUM', planDate: null, updatedAt: new Date('2026-11-01'), createdAt: new Date('2026-10-01'), number: 1, ...patch,
})
const order = (sort: Parameters<typeof compareRows>[0], rows: (SortFields & { id: string })[]) =>
  [...rows].sort(compareRows(sort)).map(r => r.id)

describe('the orders', () => {
  it('Importance: needs you, failed, running, waiting, not started, finished, done', () => {
    const ranks: ListState[] = [
      { card: 'done', finished: false }, { card: 'notStarted' }, { card: 'done', finished: true }, { card: 'waiting', onUserId: null },
      { card: 'running' }, { card: 'needsYou', why: 'failed' }, { card: 'needsYou', why: 'okay' },
    ]
    expect(ranks.map(importanceRank).sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
    const rows = ranks.map((s, i) => ({ ...row({ rank: importanceRank(s) }), id: `${s.card}${i}` }))
    expect(order('importance', rows)).toEqual(['needsYou6', 'needsYou5', 'running4', 'waiting3', 'notStarted1', 'done2', 'done0'])
  })

  it('Importance breaks ties by priority, then what changed last', () => {
    expect(order('importance', [
      { ...row({ priority: 'LOW' }), id: 'low' },
      { ...row({ priority: 'HIGH', updatedAt: new Date('2026-10-01') }), id: 'high-old' },
      { ...row({ priority: 'HIGH', updatedAt: new Date('2026-11-03') }), id: 'high-new' },
    ])).toEqual(['high-new', 'high-old', 'low'])
  })

  it('Priority: high first, then by importance', () => {
    expect(order('priority', [
      { ...row({ priority: 'LOW', rank: 0 }), id: 'low' },
      { ...row({ priority: 'HIGH', rank: 4 }), id: 'high-4' },
      { ...row({ priority: 'HIGH', rank: 2 }), id: 'high-2' },
    ])).toEqual(['high-2', 'high-4', 'low'])
  })

  it('Plan date: soonest first, no date last', () => {
    expect(order('planDate', [
      { ...row({}), id: 'none' },
      { ...row({ planDate: new Date('2026-12-04') }), id: 'dec' },
      { ...row({ planDate: new Date('2026-11-20') }), id: 'nov' },
    ])).toEqual(['nov', 'dec', 'none'])
  })

  it('Recently updated and Newest', () => {
    const rows = [
      { ...row({ updatedAt: new Date('2026-11-01'), createdAt: new Date('2026-10-05'), number: 2 }), id: 'a' },
      { ...row({ updatedAt: new Date('2026-11-05'), createdAt: new Date('2026-10-01'), number: 1 }), id: 'b' },
    ]
    expect(order('updated', rows)).toEqual(['b', 'a'])
    expect(order('newest', rows)).toEqual(['a', 'b'])
  })

  it('ranks an epic by its most pressing open task', () => {
    const open: ListState = { card: null }
    expect(epicRank(open, [{ card: 'running' }, { card: 'needsYou', why: 'okay' }, { card: 'done', finished: false }])).toBe(0)
    expect(epicRank(open, [{ card: 'done', finished: false }])).toBe(4)
    expect(epicRank({ card: 'done', finished: false }, [{ card: 'running' }])).toBe(6)
  })
})

describe('the scorecards’ counts', () => {
  it('counts each card with its breakdown, and All every row', () => {
    const counts = countRows([
      { card: 'needsYou', why: 'okay' }, { card: 'needsYou', why: 'failed' }, { card: 'running' },
      { card: 'waiting', onUserId: 'sam' }, { card: 'waiting', onUserId: null }, { card: 'waiting', onUserId: 'sam' },
      { card: 'notStarted' }, { card: 'done', finished: true }, { card: 'done', finished: false }, { card: null },
    ])
    expect(counts).toEqual({
      all: 10,
      needsYou: { count: 2, okay: 1, failed: 1, noAgent: 0 },
      running: { count: 1 },
      waiting: { count: 3, on: [{ userId: 'sam', count: 2 }] },
      notStarted: { count: 1 },
      done: { count: 2, finished: 1 },
    })
  })
})

describe('search', () => {
  it('finds words in the title, or the key or number', () => {
    const t = { title: 'Write the home page copy', number: 12, projectKey: 'WEB' }
    expect(matchesSearch(t, 'home PAGE')).toBe(true)
    expect(matchesSearch(t, 'web-12')).toBe(true)
    expect(matchesSearch(t, '12')).toBe(true)
    expect(matchesSearch(t, 'INT-12')).toBe(false)
    expect(matchesSearch(t, 'footer')).toBe(false)
    expect(searchedNumber('WEB-x', 'WEB')).toBeNull()
  })
})
