/** A task page's state (T0, T10): the header's one button, Now's block, a run's line, an epic's progress, the date style. */
import { describe, it, expect } from 'vitest'
import {
  taskPageWords, headerButton, nowKind, latestRun, runLine, runCountOf, epicProgress, epicStateText, epicDueText, daysLeftText,
  deleteTakes, dayText, whenText, planText, tasksListPath, type PageRun, type PageTask, type EpicChild,
} from '../taskPageState'

const NOW = new Date(2026, 10, 6, 9, 15)
const task = (over: Partial<PageTask> = {}): PageTask => ({ runState: 'RUN_NONE', runStateReason: null, status: 'TODO', ...over })
const run = (over: Partial<PageRun> = {}): PageRun => ({
  id: 'r1', number: 1, status: 'COMPLETED', agent: { name: 'Writer' },
  startedAt: new Date(2026, 10, 6, 7, 54).toISOString(), endedAt: new Date(2026, 10, 6, 7, 55).toISOString(),
  createdAt: new Date(2026, 10, 6, 7, 54).toISOString(), ...over,
})

function page(t: PageTask, o: { pending?: boolean; readOnly?: boolean; runs?: PageRun[] } = {}) {
  const words = taskPageWords(t, { hasPendingApproval: !!o.pending, readOnly: !!o.readOnly, runs: o.runs, now: NOW })
  return { words, button: headerButton(words, t), now: nowKind(words, t, latestRun(o.runs)) }
}

describe('a task page by state', () => {
  it('not started: Run, and Now says no run yet', () => {
    expect(page(task())).toMatchObject({ button: 'run', now: 'notStarted', words: { text: 'Not started' } })
  })

  it('waiting for an okay: Review, and Now holds the approval', () => {
    const p = page(task({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' }), { pending: true })
    expect(p).toMatchObject({ button: 'review', now: 'approval', words: { text: 'Needs your okay' } })
  })

  it('to someone who may only read, an okay waits on a member, and Now still shows the request', () => {
    const p = page(task({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' }), { pending: true, readOnly: true })
    expect(p.words.text).toBe('Waiting · needs a member’s okay')
    expect(p.button).toBeNull()
    expect(p.now).toBe('approval')
  })

  it('running: Stop, Now shows the live run with how long', () => {
    const live = run({ number: 2, status: 'RUNNING', endedAt: null, startedAt: new Date(2026, 10, 6, 9, 11).toISOString() })
    const p = page(task({ runState: 'RUN_ACTIVE' }), { runs: [run(), live] })
    expect(p).toMatchObject({ button: 'stop', now: 'live', words: { text: 'Running · 4 min' } })
  })

  it('queued: Stop, Now says it waits', () => {
    expect(page(task({ runState: 'RUN_QUEUED' }))).toMatchObject({ button: 'stop', now: 'waiting', words: { text: 'Waiting' } })
  })

  it('failed: Run again, Now shows the failure', () => {
    const p = page(task({ runState: 'RUN_FAILED', runStateReason: 'Model overloaded — retry later' }), { runs: [run({ status: 'FAILED' })] })
    expect(p).toMatchObject({ button: 'runAgain', now: 'failure' })
    expect(p.words.text).toBe('Failed · model overloaded')
  })

  it('finished: Run again, Now shows the latest result', () => {
    expect(page(task(), { runs: [run()] })).toMatchObject({ button: 'runAgain', now: 'result', words: { text: 'Finished' } })
  })

  it('done: no header button (Run again is in the menu), Now shows the result', () => {
    expect(page(task({ status: 'DONE' }), { runs: [run()] })).toMatchObject({ button: null, now: 'result', words: { text: 'Done' } })
  })

  it('an epic has no run button whatever its state', () => {
    expect(page(task({ isEpic: true })).button).toBeNull()
  })
})

describe('a run', () => {
  it('the latest is the highest number', () => {
    expect(latestRun([run({ id: 'a', number: 2 }), run({ id: 'b', number: 3 }), run({ id: 'c', number: 1 })])?.id).toBe('b')
    expect(latestRun([])).toBeNull()
  })

  it('reads as who, which run, and when it ended', () => {
    expect(runLine(run({ number: 2 }), NOW)).toBe('Writer · Run 2 · finished 07:55')
    expect(runLine(run({ status: 'CANCELLED', endedAt: new Date(2026, 10, 5, 18, 2).toISOString() }), NOW)).toBe('Writer · Run 1 · stopped 5 Nov, 18:02')
  })

  it('counts from the highest number, which is never reused', () => {
    expect(runCountOf([run({ number: 4 })])).toBe(4)
    expect(runCountOf(undefined)).toBe(0)
  })
})

describe('an epic', () => {
  const child = (state: EpicChild['state']): EpicChild => ({ id: Math.random().toString(), state })
  const tasks = [child('DONE'), child('DONE'), child('DONE'), child('IN_PROGRESS'), child('IN_PROGRESS'), child('TODO')]

  it('counts its tasks by task state, never by run (D2)', () => {
    const p = epicProgress(tasks)
    expect(p).toEqual({ done: 3, total: 6, inProgress: 2, todo: 1, backlog: 0 })
    expect(epicStateText(p)).toBe('2 in progress · 1 to do')
    expect(epicStateText(epicProgress([child('BACKLOG'), child('DONE')]))).toBe('1 in Backlog')
  })

  it('says when it is due and how far away that is', () => {
    expect(epicDueText('2026-11-20', NOW)).toBe('due 20 Nov, 14 days')
    expect(epicDueText('2026-11-07', NOW)).toBe('due 7 Nov, 1 day')
    expect(epicDueText('2026-11-06', NOW)).toBe('due today')
    expect(epicDueText('2026-11-03', NOW)).toBe('due 3 Nov, 3 days past')
    expect(epicDueText('2027-01-04', NOW)).toBe('due 4 Jan 2027, 59 days')
  })

  it('says how many days are left to its milestone', () => {
    expect(daysLeftText('2026-11-20', NOW)).toBe('14 days left')
    expect(daysLeftText('2026-11-07', NOW)).toBe('1 day left')
    expect(daysLeftText('2026-11-06', NOW)).toBe('Due today')
    expect(daysLeftText('2026-11-03', NOW)).toBe('3 days past')
  })
})

describe('the words around it', () => {
  it('one date style', () => {
    expect(dayText(new Date(2026, 10, 6))).toBe('6 Nov 2026')
    expect(whenText(new Date(2026, 10, 6, 7, 45), NOW)).toBe('07:45')
    expect(whenText(new Date(2026, 3, 7, 19, 30), NOW)).toBe('7 Apr, 19:30')
    expect(planText(new Date(2027, 3, 6), new Date(2027, 3, 15))).toBe('6 – 15 Apr 2027')
    expect(planText(new Date(2027, 2, 28), new Date(2027, 3, 4))).toBe('28 Mar – 4 Apr 2027')
    expect(planText(null, null)).toBeNull()
  })

  it('what a delete takes with it', () => {
    expect(deleteTakes({ comments: 1, runs: 1, conversation: true })).toEqual([
      'its 1 comment and its files', 'its 1 run and what the run recorded', 'its conversation',
    ])
    expect(deleteTakes({ comments: 0, runs: 3, conversation: false })).toEqual(['its files', 'its 3 runs and what they recorded'])
  })

  it('a task key leads back to its project’s Tasks', () => {
    expect(tasksListPath('WEB-7')).toBe('/projects/WEB/tasks')
    expect(tasksListPath('nonsense')).toBe('/tasks')
  })
})
