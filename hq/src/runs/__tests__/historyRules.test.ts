import { describe, it, expect } from 'vitest'
import {
  countRows, dispatchFactsOf, matchesStarter, matchesWhose, pageOf, parseHistoryArgs, placeRun, runLimitsOf, sortRows,
  startedByWords, tookMs, whoseOf, withinWhen,
} from '../historyRules'

const run = (over: Record<string, unknown> = {}) => ({ id: 'r1', status: 'COMPLETED', manifestStatus: null, error: null, ...over }) as Parameters<typeof placeRun>[0]

describe('the Runs history: what the browser asked for', () => {
  it('keeps what is known and drops the rest, never an error', () => {
    const f = parseHistoryArgs({ state: 'needs', kind: 'routine', sort: 'cost', page: 3, search: '  footer  ', agentId: 'a'.repeat(65) } as never)
    expect(f).toMatchObject({ state: 'needs', kind: 'routine', sort: 'cost', page: 3, search: 'footer', agentId: null })
    expect(parseHistoryArgs({ state: 'everything', page: -2, when: 'yesterday' } as never)).toMatchObject({ state: 'all', page: 1, when: 'any' })
    expect(parseHistoryArgs(undefined)).toMatchObject({ state: 'all', kind: 'any', sort: 'newest', whose: 'all', startedBy: 'any' })
  })
})

describe('the Runs history: where a run sits @RU5', () => {
  it('a run going now, one waiting to start on its site, and one finished', () => {
    expect(placeRun(run({ status: 'RUNNING' }), null)).toMatchObject({ group: 'running', ring: 'RUNNING' })
    expect(placeRun(run({ status: 'PENDING' }), null)).toMatchObject({ group: 'waiting', ring: 'WAITING' })
    expect(placeRun(run(), null)).toMatchObject({ group: 'finished', ring: null, note: null })
  })

  it('a task’s latest run that asks, or failed while the task still waits for someone, needs the person; an older failure does not', () => {
    const asks = placeRun(run({ manifestStatus: 'PENDING_APPROVAL' }), { latestRunId: 'r1', need: 'approval' })
    expect(asks).toMatchObject({ group: 'needs', ring: 'NEEDS_YOU', ask: true, note: { tone: 'warning', lead: 'Wants your okay' } })
    const failed = placeRun(run({ status: 'FAILED', error: 'exited with code 137' }), { latestRunId: 'r1', need: 'failed' })
    expect(failed).toMatchObject({ group: 'needs', ring: 'FAILED', failedNeed: true, note: { tone: 'danger', lead: 'Failed', text: "The agent's process stopped unexpectedly." } })
    const older = placeRun(run({ status: 'FAILED' }), { latestRunId: 'r9', need: 'failed' })
    expect(older).toMatchObject({ group: 'finished', ring: 'FAILED', failedNeed: false })
  })

  it('a request a newer run replaced asks for nothing; a reply’s request asks until it is answered', () => {
    expect(placeRun(run({ manifestStatus: 'PENDING_APPROVAL' }), { latestRunId: 'r2', need: 'approval' }).group).toBe('finished')
    expect(placeRun(run({ manifestStatus: 'PENDING_APPROVAL' }), null).group).toBe('needs')
  })

  it('a stopped run says who stopped it, never “Did not finish”', () => {
    expect(placeRun(run({ status: 'CANCELLED', error: 'stopped by Sam Okafor' }), null).note).toEqual({ tone: 'muted', lead: null, text: 'Stopped by Sam Okafor' })
    expect(placeRun(run({ status: 'CANCELLED', error: 'Cancelled by user' }), null).note?.text).toBe('Stopped')
  })
})

describe('the Runs history: who started a run, and for whom', () => {
  const me = 'me'
  const names = (id: string) => ({ kai: 'Kai' } as Record<string, string>)[id] ?? null

  it('reads the dispatch the site kept with the run, and nothing that is not one of its values', () => {
    expect(dispatchFactsOf({ dispatch: { startedBy: 'person', onBehalfOfUserId: 'kai' } })).toEqual({ startedBy: 'person', onBehalfOfUserId: 'kai' })
    expect(dispatchFactsOf({ dispatch: { startedBy: 'wizard', onBehalfOfUserId: 7 } })).toEqual({ startedBy: null, onBehalfOfUserId: null })
    expect(dispatchFactsOf(null)).toEqual({ startedBy: null, onBehalfOfUserId: null })
    expect(runLimitsOf({ dispatch: { runLimits: { timeLimitMinutes: 60, turnLimit: 50 } } })).toEqual({ timeLimitMinutes: 60, turnLimit: 50 })
    expect(runLimitsOf({ dispatch: { runLimits: { timeLimitMinutes: '60' } } })).toBeNull()
  })

  it('words the starter as the list shows it', () => {
    expect(startedByWords(whoseOf({ startedBy: 'person', onBehalfOfUserId: me }, null), 'task', me, names, null)).toBe('you')
    expect(startedByWords(whoseOf({ startedBy: 'person', onBehalfOfUserId: 'kai' }, null), 'task', me, names, null)).toBe('Kai')
    expect(startedByWords(whoseOf({ startedBy: 'agent', onBehalfOfUserId: null }, 'kai'), 'task', me, names, 'Planner')).toBe('Planner')
    expect(startedByWords(whoseOf({ startedBy: 'schedule', onBehalfOfUserId: null }, me), 'routine', me, names, null)).toBe('on its schedule')
  })

  it('narrows by Started by and by Whose', () => {
    const mine = whoseOf({ startedBy: 'person', onBehalfOfUserId: me }, null)
    const kais = whoseOf({ startedBy: 'person', onBehalfOfUserId: 'kai' }, null)
    const forMe = whoseOf({ startedBy: 'agent', onBehalfOfUserId: null }, me)
    expect([mine, kais, forMe].map(w => matchesStarter(w, 'me', me))).toEqual([true, false, false])
    expect([mine, kais, forMe].map(w => matchesStarter(w, 'people', me))).toEqual([false, true, false])
    expect([mine, kais, forMe].map(w => matchesStarter(w, 'agents', me))).toEqual([false, false, true])
    expect([mine, kais, forMe].map(w => matchesWhose(w, 'started', me))).toEqual([true, false, false])
    expect([mine, kais, forMe].map(w => matchesWhose(w, 'behalf', me))).toEqual([true, false, true])
  })
})

describe('the Runs history: counting, sorting and paging', () => {
  const row = (at: string, cost: number | null, took: number | null, group: 'running' | 'finished' = 'finished') => ({ at, cost, tookMs: took, group })

  it('counts each tab', () => {
    expect(countRows([row('a', 1, 1, 'running'), row('b', 1, 1), row('c', 1, 1)])).toEqual({ all: 3, running: 1, waiting: 0, needs: 0, finished: 2 })
  })

  it('sorts newest first, or by cost or time taken with the newest first among equals', () => {
    const rows = [row('2026-11-07T09:00', 0.04, 60_000), row('2026-11-07T11:00', 0.01, 360_000), row('2026-11-07T10:00', 0.04, null)]
    expect(sortRows(rows, 'newest').map(r => r.at)).toEqual(['2026-11-07T11:00', '2026-11-07T10:00', '2026-11-07T09:00'])
    expect(sortRows(rows, 'cost').map(r => r.at)).toEqual(['2026-11-07T10:00', '2026-11-07T09:00', '2026-11-07T11:00'])
    expect(sortRows(rows, 'took').map(r => r.at)).toEqual(['2026-11-07T11:00', '2026-11-07T09:00', '2026-11-07T10:00'])
  })

  it('pages twenty at a time; a page past the end is the last one', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i)
    expect(pageOf(rows, 1)).toEqual({ rows: rows.slice(0, 20), page: 1 })
    expect(pageOf(rows, 3)).toEqual({ rows: rows.slice(40), page: 3 })
    expect(pageOf(rows, 9).page).toBe(3)
    expect(pageOf([], 4)).toEqual({ rows: [], page: 1 })
  })

  it('times a run to now while it goes, and keeps When to its window', () => {
    const now = new Date('2026-11-07T12:00:00Z')
    expect(tookMs({ startedAt: '2026-11-07T11:59:00Z', endedAt: null }, now)).toBe(60_000)
    expect(tookMs({ startedAt: null, endedAt: null }, now)).toBeNull()
    const today = new Date('2026-11-07T00:00:00Z')
    expect(withinWhen('2026-11-06T23:00:00Z', 'today', today, now)).toBe(false)
    expect(withinWhen('2026-11-01T12:00:00Z', 'week', today, now)).toBe(true)
    expect(withinWhen('2026-10-01T12:00:00Z', 'month', today, now)).toBe(false)
  })
})
