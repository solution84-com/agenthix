import { describe, expect, it } from 'vitest'
import type { RoutineRunView, RoutineSummary } from '../../../shared/routineTypes'
import { filterRoutines, routineCounts, upNext } from '../routineListWords'
import { aboutOf, factsOf } from '../routineRunFactsRules'

const run = (over: Partial<RoutineRunView> = {}): RoutineRunView => ({
  id: 'x', number: 1, dueAt: null, startedBy: null, onBehalfOf: { userId: 'u', username: 'U' }, state: 'FINISHED', ask: null,
  reason: null, sessionId: 's', runId: 'r', startedAt: '2026-11-07T09:00:00Z', endedAt: '2026-11-07T09:01:00Z', ...over,
})
const routine = (id: string, over: Partial<RoutineSummary> = {}): RoutineSummary => ({
  id, projectId: 'p', title: id, agent: { id: 'a', name: 'Writer' }, cron: '0 9 * * 1-5', timezone: 'UTC', scheduleWords: null,
  enabled: true, pausedReason: null, nextDueAt: null, onBehalfOf: { userId: 'u', username: 'U' }, modelChoice: null, canChange: true,
  lastRuns: [], ...over,
})

describe('the counts and Up next over routines @SC-RT1', () => {
  const list = [
    routine('daily', { cron: '0 14 * * *' }),
    routine('asks', { lastRuns: [run({ state: 'STOPPED', ask: 'approval' })] }),
    routine('fails', { lastRuns: [run({ state: 'FAILED' })] }),
    routine('off', { enabled: false, cron: '* * * * *' }),
  ]

  it('counts Routines on, Needs you, Failing, Ran today and Spent today', () => {
    const counts = routineCounts(list, { ran: 3, running: 1, spent: 0.07 })
    expect(counts.map(c => [c.label, c.count, c.detail])).toEqual([
      ['Routines on', '3', '1 is off'], ['Needs you', '1', 'show only them'], ['Failing', '1', 'failed its last run'],
      ['Ran today', '3', '1 running now'], ['Spent today', '$0.07', 'on 3 runs'],
    ])
    expect(counts[0].of).toBe('of 4')
  })

  it('filters by the count chosen', () => {
    expect(filterRoutines(list, 'needs').map(r => r.id)).toEqual(['asks'])
    expect(filterRoutines(list, 'failing').map(r => r.id)).toEqual(['fails'])
    expect(filterRoutines(list, 'on').map(r => r.id)).toEqual(['daily', 'asks', 'fails'])
  })

  it('lists the next three firings in time order, the switched-off ones left out', () => {
    const next = upNext(list, new Date('2026-11-07T11:46:00Z'))
    expect(next.map(n => `${n.routine.id} ${n.at.toISOString()}`)).toEqual([
      'daily 2026-11-07T14:00:00.000Z', 'daily 2026-11-08T14:00:00.000Z', 'asks 2026-11-09T09:00:00.000Z',
    ])
  })
})

describe("a routine run's cost and today's runs, from the sites @SC-RT2", () => {
  const today = new Date('2026-11-07T00:00:00Z')
  const usage = { inputTokens: 1000, outputTokens: 1000 } as never

  it("adds every run of a firing's session, and counts today's runs and what they cost", () => {
    const runs = [
      { id: 'a', sessionId: 's1', state: 'FINISHED', startedAt: new Date('2026-11-07T09:00:00Z') },
      { id: 'b', sessionId: 's2', state: 'RUNNING', startedAt: new Date('2026-11-06T09:00:00Z') },
      { id: 'c', sessionId: null, state: 'SKIPPED', startedAt: new Date('2026-11-07T10:00:00Z') },
      { id: 'a', sessionId: 's1', state: 'FINISHED', startedAt: new Date('2026-11-07T09:00:00Z') },
    ]
    const rows = [
      { sessionId: 's1', usage, model: 'claude-sonnet-4-5' }, { sessionId: 's1', usage, model: 'claude-sonnet-4-5' },
      { sessionId: 's2', usage: null, model: 'x' },
    ]
    const f = factsOf(runs, rows, today)
    expect(Object.keys(f.cost)).toEqual(['a'])
    expect(f.cost.a).toBeGreaterThanOrEqual(0)
    expect(f.today).toEqual({ ran: 1, running: 1, spent: f.cost.a })
  })

  it("reads its instructions as one line for its card", () => {
    expect(aboutOf('# Check links\n\n- List any **broken** link\n- Make a Bug')).toBe('Check links List any broken link Make a Bug')
    expect(aboutOf('x'.repeat(300))).toHaveLength(240)
  })
})
