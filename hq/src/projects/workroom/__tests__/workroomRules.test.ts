import { describe, expect, it } from 'vitest'
import { HELD_FOR_RECONNECT_REASON, MANIFEST_BLOCKED_REASON, WAITING_FOR_SLOT_REASON } from '../../../agents/taskExecutionReasons'
import { addCounts, countsOf, lineWhy, needOf, ringOf, todayWindow, waitsOnItsSite, type LineTask } from '../workroomRules'
import type { WorkroomAgent } from '../workroomTypes'

const NOW = new Date('2026-11-07T11:46:00Z')

const line = (over: Partial<LineTask>): LineTask => ({
  id: 'x', title: 'A task', runState: 'RUN_QUEUED', runStateReason: null, scheduleNextDueAt: null, ...over,
})

describe('todayWindow', () => {
  it("takes the viewer's own start of today", () => {
    expect(todayWindow('2026-11-07T00:00:00.000Z', NOW).toISOString()).toBe('2026-11-07T00:00:00.000Z')
  })

  it('reads anything missing, unreadable, in the future or too far back as the last 24 hours', () => {
    const day = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString()
    for (const bad of [undefined, 42, 'not a date', '2026-11-08T00:00:00Z', '2026-11-01T00:00:00Z', 'x'.repeat(100)]) {
      expect(todayWindow(bad, NOW).toISOString()).toBe(day)
    }
  })
})

describe('ringOf', () => {
  it('turns while at work, before what needs a person, before a failure, before waiting', () => {
    expect(ringOf({ running: 2, asking: 1, failed: 1, waiting: 2 })).toBe('RUNNING')
    expect(ringOf({ running: 0, asking: 1, failed: 1, waiting: 1 })).toBe('NEEDS_YOU')
    expect(ringOf({ running: 0, asking: 0, failed: 1, waiting: 1 })).toBe('FAILED')
    expect(ringOf({ running: 0, asking: 0, failed: 0, waiting: 1 })).toBe('WAITING')
    expect(ringOf({ running: 0, asking: 0, failed: 0, waiting: 0 })).toBeNull()
  })
})

describe('lineWhy', () => {
  it('says the first is next after the run at work, and each after it waits for the one before', () => {
    const tasks = [line({ id: 'a', title: 'Draft the case-study page' }), line({ id: 'b', title: 'Second' })]
    expect(lineWhy(tasks, 0, 'Fix the contact form', null, NOW)).toEqual({ kind: 'next', after: 'Fix the contact form' })
    expect(lineWhy(tasks, 1, 'Fix the contact form', null, NOW)).toEqual({ kind: 'after', title: 'Draft the case-study page' })
  })

  it('gives a Run at… time, a busy site, and a site that is not answering', () => {
    const at = new Date('2026-11-07T14:00:00Z')
    expect(lineWhy([line({ runState: 'RUN_NONE', scheduleNextDueAt: at })], 0, null, null, NOW)).toEqual({ kind: 'startsAt', at: at.toISOString() })
    expect(lineWhy([line({ runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON })], 0, null, 'fernhill-hq', NOW))
      .toEqual({ kind: 'siteBusy', siteName: 'fernhill-hq' })
    expect(lineWhy([line({ runStateReason: HELD_FOR_RECONNECT_REASON })], 0, null, 'studio', NOW)).toEqual({ kind: 'siteAway', siteName: 'studio' })
  })

  it('counts only tasks in line, not a Run at… time, as the one a queued task waits behind', () => {
    const tasks = [line({ id: 'a', runState: 'RUN_NONE', scheduleNextDueAt: new Date('2026-11-07T14:00:00Z') }), line({ id: 'b' })]
    expect(lineWhy(tasks, 1, null, null, NOW)).toEqual({ kind: 'next', after: null })
  })
})

describe('waitsOnItsSite', () => {
  it('holds a running task its site keeps waiting for a slot as in line, not at work', () => {
    expect(waitsOnItsSite({ runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON })).toBe(true)
    expect(waitsOnItsSite({ runState: 'RUN_ACTIVE', runStateReason: null })).toBe(false)
  })
})

describe('needOf', () => {
  const task = { state: 'IN_PROGRESS', status: 'IN_PROGRESS', isEpic: false, typeKind: 'TASK' }
  it('names an okay, an answer and a failure, by the one rule', () => {
    expect(needOf({ ...task, runState: 'RUN_BLOCKED', runStateReason: `${MANIFEST_BLOCKED_REASON}: npm run build` })).toBe('approval')
    expect(needOf({ ...task, runState: 'RUN_BLOCKED', runStateReason: 'Photos or drawings?' })).toBe('answer')
    expect(needOf({ ...task, runState: 'RUN_FAILED', runStateReason: 'the build command failed' })).toBe('failed')
  })

  it('waits for nobody on a failure of a Done task, an epic, or a task not stopped on a person', () => {
    expect(needOf({ ...task, state: 'DONE', runState: 'RUN_FAILED', runStateReason: null })).toBeNull()
    expect(needOf({ ...task, isEpic: true, runState: 'RUN_BLOCKED', runStateReason: null })).toBeNull()
    expect(needOf({ ...task, runState: 'RUN_ACTIVE', runStateReason: null })).toBeNull()
  })
})

const agent = (over: Partial<WorkroomAgent>): WorkroomAgent => ({
  agentId: 'a', name: 'Writer', handle: 'writer', avatarUrl: null, role: null, ring: null, ready: 0, inLine: 0, runsToday: 0,
  spentToday: 0, now: [], line: [], needs: [], finishedToday: 0, lastFinished: null, ...over,
})

describe('countsOf', () => {
  it('adds up the cards: what needs a person by kind, runs by kind, waiting, finished, spent and ready', () => {
    const need = { taskId: 't', taskKey: 'WEB-1', title: 'T', href: '/tasks/WEB-1', detail: null, runNumber: 1, since: NOW.toISOString() }
    const run = { key: 'r', title: 'T', taskId: 't', taskKey: 'WEB-1', href: null, sessionId: 's', runNumber: 1, since: null, startedBy: null }
    const c = countsOf([
      agent({ needs: [{ ...need, reason: 'approval' }, { ...need, reason: 'failed' }], now: [{ ...run, kind: 'task' }, { ...run, kind: 'reply' }], spentToday: 0.21, ready: 1, finishedToday: 5 }),
      agent({ line: [{ taskId: 'q', taskKey: 'WEB-4', title: 'Q', href: '/tasks/WEB-4', why: { kind: 'next', after: null } }], spentToday: 0.12, ready: 2 }),
    ])
    expect(c).toMatchObject({ needsYou: 2, needsAsking: 1, needsFailed: 1, running: 2, runningTasks: 1, runningReplies: 1, waiting: 1, finishedToday: 5, ready: 3, runningProjects: 1 })
    expect(c.spentToday).toBeCloseTo(0.33)
    expect(addCounts([c, c]).runningProjects).toBe(2)
  })
})
