import { describe, expect, it } from 'vitest'
import type { RoutineRunView, RoutineSummary } from '../../../shared/routineTypes'
import {
  askWords, failedInARow, goingWords, marksLabel, nextWords, offWords, routineRing, runDidWords, runMark, runNowWhy,
  savingAsks, spanWords, tookWords, whoWords,
} from '../routineWords'

const run = (over: Partial<RoutineRunView> = {}): RoutineRunView => ({
  id: Math.random().toString(36).slice(2), number: 1, dueAt: null, startedBy: null, onBehalfOf: { userId: 'kai', username: 'Kai Mensah' },
  state: 'FINISHED', ask: null, reason: null, sessionId: 's', runId: 'r', startedAt: '2026-11-07T09:00:00Z', endedAt: '2026-11-07T09:03:00Z', ...over,
})
const routine = (over: Partial<RoutineSummary> = {}): RoutineSummary => ({
  id: 'r1', projectId: 'p', title: 'Weekly link check', agent: { id: 'a', name: 'Reviewer' }, cron: '0 9 * * 1-5', timezone: 'UTC',
  scheduleWords: 'At 09:00, Monday to Friday, UTC', enabled: true, pausedReason: null, nextDueAt: '2026-11-10T09:00:00Z',
  onBehalfOf: { userId: 'kai', username: 'Kai Mensah' }, modelChoice: null, canChange: true, lastRuns: [], ...over,
})
const sam = { id: 'sam', name: 'Sam Okafor' }
const VIEWER = 'You are a Viewer here'

describe("a routine's runs as marks and words @SC-RT1", () => {
  it('gives each ending its own mark', () => {
    expect(runMark(run())).toBe('finished')
    expect(runMark(run({ state: 'FAILED' }))).toBe('failed')
    expect(runMark(run({ state: 'SKIPPED', number: null }))).toBe('skipped')
    expect(runMark(run({ state: 'STOPPED', ask: 'approval' }))).toBe('asked')
    expect(runMark(run({ state: 'RUNNING' }))).toBe('going')
  })

  it('names the marks oldest first in the accessible name, as a tally', () => {
    expect(marksLabel([run(), run({ state: 'SKIPPED' }), run({ state: 'FAILED' }), run({ ask: 'approval', state: 'STOPPED' })]))
      .toBe('Last 4 firings: 1 finished, 1 skipped, 1 failed, 1 needing you')
  })

  it('says how it has been going', () => {
    expect(goingWords(Array.from({ length: 10 }, () => run())).counts).toBe('10 of the last 10 finished')
    expect(goingWords([run(), run()]).counts).toBe('2 of 2 finished')
    expect(goingWords([run({ state: 'STOPPED', ask: 'approval' }), run(), run({ state: 'SKIPPED' }), run({ state: 'FAILED' })]).counts)
      .toBe('1 finished · 1 skipped · 1 failed · asked you once')
  })

  it('says a routine that keeps failing in words, with why, skipped firings aside', () => {
    const runs = [run({ state: 'FAILED', reason: "the browser tool isn't set up" }), run({ state: 'SKIPPED' }), run({ state: 'FAILED' }), run()]
    expect(failedInARow({ lastRuns: runs })).toBe(2)
    expect(goingWords(runs)).toMatchObject({ failing: 'Failed the last 2 times', reason: "the browser tool isn't set up" })
    expect(goingWords([run({ state: 'FAILED' }), run()]).failing).toBe('Failed its last run')
  })

  it('rings its agent: running, needs you, failed, or none', () => {
    expect(routineRing({ lastRuns: [run({ state: 'RUNNING' })] })).toBe('RUNNING')
    expect(routineRing({ lastRuns: [run({ state: 'STOPPED', ask: 'approval' })] })).toBe('NEEDS_YOU')
    expect(routineRing({ lastRuns: [run({ state: 'FAILED' })] })).toBe('FAILED')
    expect(routineRing({ lastRuns: [run(), run({ state: 'FAILED' })] })).toBeNull()
  })
})

describe('when it runs next, and Run now @SC-RT1', () => {
  const now = new Date('2026-11-07T11:46:00Z')

  it('counts down within a day, names the day further off, and says a run is going', () => {
    expect(nextWords(routine({ nextDueAt: '2026-11-07T14:00:00Z' }), now)).toEqual({ text: 'next in 2 h 14 min', live: false })
    expect(nextWords(routine({ nextDueAt: '2026-11-10T09:00:00Z' }), now).text).toMatch(/^next \w{3} \d\d:\d\d$/)
    expect(nextWords(routine({ lastRuns: [run({ state: 'RUNNING', startedAt: '2026-11-07T11:30:00Z' })] }), now)).toEqual({ text: 'Running · 16 min', live: true })
    expect(nextWords(routine({ enabled: false }), now).text).toBe('Off')
  })

  it('greys Run now with why: a Viewer, off, no agent, or its last run still going (N6, D15)', () => {
    expect(runNowWhy(routine({ canChange: false }), VIEWER)).toBe(VIEWER)
    expect(runNowWhy(routine({ enabled: false }), VIEWER)).toBe('It is off: turn it on to run it')
    expect(runNowWhy(routine({ agent: null }), VIEWER)).toBe('It has no agent: choose one to run it')
    expect(runNowWhy(routine({ lastRuns: [run({ state: 'RUNNING', number: 23 })] }), VIEWER)).toBe('Run 23 is still going')
    expect(runNowWhy(routine(), VIEWER)).toBeUndefined()
  })

  it('reads a run that was started with Run now as started by whoever pressed it', () => {
    const pressed = run({ startedBy: { userId: 'sam', username: 'Sam Okafor' } })
    expect(runDidWords(pressed, sam)).toMatchObject({ state: 'Finished', rest: 'started by you (Run now)' })
    expect(runDidWords(run({ state: 'SKIPPED', reason: 'run 12 was still running' }), sam)).toMatchObject({ state: 'Skipped', rest: 'run 12 was still running' })
    expect(tookWords(run(), now)).toBe('3 min')
    expect(tookWords(run({ state: 'SKIPPED' }), now)).toBe('—')
    expect(spanWords(40_000)).toBe('40 s')
  })
})

describe('on whose behalf, and saving asks first @SC-RT2', () => {
  it('names who it runs for, the viewer as "(you)"', () => {
    expect(whoWords(routine(), sam)).toBe('Reviewer · on behalf of Kai Mensah')
    expect(whoWords(routine({ onBehalfOf: { userId: 'sam', username: 'Sam Okafor' } }), sam)).toBe('Reviewer · on behalf of Sam Okafor (you)')
  })

  it("asks only when the change moves whose behalf it runs on (N6)", () => {
    expect(savingAsks(routine(), sam)).toBe(true)
    expect(savingAsks(routine({ onBehalfOf: { userId: 'sam', username: 'Sam Okafor' } }), sam)).toBe(false)
    expect(askWords(routine(), sam)).toBe("This routine will now run on your behalf (Sam Okafor), not Kai Mensah's.")
  })

  it('collapses a switched-off routine to one line', () => {
    expect(offWords(routine({ enabled: false, lastRuns: [run(), run()] }))).toBe('At 09:00, Monday to Friday, UTC · off · 2 runs, both finished')
    expect(offWords(routine({ enabled: false, pausedReason: 'Kai can no longer work here' }))).toBe('At 09:00, Monday to Friday, UTC · off: Kai can no longer work here · no runs yet')
  })
})
