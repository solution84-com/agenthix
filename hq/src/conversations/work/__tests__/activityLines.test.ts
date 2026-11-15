import { describe, expect, it } from 'vitest'
import {
  helperEnded, helperStarted, liveLinesOf, noLiveLines, orderActivity, runHrefOf, taskWaitingLine, toActivityView, type ActivityRow,
} from '../activityLines'

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 'o1', kind: 'WORKER', state: 'RUNNING', title: 'Profile the image pipeline', boundaryName: 'Shop',
  lines: [], endedHelpers: 0, createdAt: new Date('2026-10-16T10:00:00Z'), ...over,
})

describe('the live lines of a run @SC-972', () => {
  it('write each helper as a path from the boundary', () => {
    const live = helperStarted(helperStarted(noLiveLines(), 't1', 'Profile the image pipeline'), 't2', 'Measure resize times')
    expect(liveLinesOf('Shop', live)).toEqual(['Shop · Profile the image pipeline', 'Shop · Measure resize times'])
  })

  it('drop a helper that ends and count it', () => {
    let live = helperStarted(helperStarted(noLiveLines(), 't1', 'One'), 't2', 'Two')
    live = helperEnded(live, 't1')
    expect(liveLinesOf('Shop', live)).toEqual(['Shop · Two'])
    expect(live.ended).toBe(1)
  })

  it('count a helper once however often its end or start is seen', () => {
    let live = helperStarted(noLiveLines(), 't1', 'One')
    live = helperStarted(live, 't1', 'One')
    expect(live.open).toHaveLength(1)
    live = helperEnded(helperEnded(live, 't1'), 't1')
    expect(live.ended).toBe(1)
    expect(helperEnded(live, 'unknown')).toBe(live)
  })

  it('read without a boundary as the helper alone', () => {
    expect(liveLinesOf(null, helperStarted(noLiveLines(), 't1', 'One'))).toEqual(['One'])
  })
})

describe('a task that has not started @SC-972', () => {
  it("reads where it waits, with the agent's queue", () => {
    expect(taskWaitingLine('QUEUED', 'Shop', 'Developer', 'SHOP-214')).toBe("Shop · Developer · SHOP-214 — in Developer's queue")
    expect(taskWaitingLine('RUNNING', 'Shop', 'Developer', 'SHOP-214')).toBeNull()
  })
})

describe('the sheet @SC-972', () => {
  it('lists outstanding work first, then ended, each newest first', () => {
    const rows = orderActivity([
      row({ id: 'ended-new', state: 'COMPLETED', createdAt: new Date('2026-10-16T12:00:00Z') }),
      row({ id: 'old', state: 'QUEUED', createdAt: new Date('2026-10-16T09:00:00Z') }),
      row({ id: 'ended-old', state: 'FAILED', createdAt: new Date('2026-10-16T08:00:00Z') }),
      row({ id: 'new', state: 'RUNNING', createdAt: new Date('2026-10-16T11:00:00Z') }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['new', 'old', 'ended-new', 'ended-old'])
  })

  it.each([
    ['ACCEPTED', 'queued'], ['QUEUED', 'queued'], ['RUNNING', 'working'], ['UNCERTAIN', 'working'],
    ['WAITING_FOR_APPROVAL', 'waiting'],
    ['FAILED', 'failed'], ['COMPLETED', 'completed'], ['CANCELLED', 'cancelled'],
  ] as const)('words %s as %s', (state, word) => {
    expect(toActivityView(row({ state }), true).word).toBe(word)
  })

  it('offers Stop to those who may speak, only on work still going', () => {
    expect(toActivityView(row({ state: 'RUNNING' }), true).canStop).toBe(true)
    expect(toActivityView(row({ state: 'RUNNING' }), false).canStop).toBe(false)
    expect(toActivityView(row({ state: 'COMPLETED' }), true).canStop).toBe(false)
  })

  it('shows no live lines on an ended row', () => {
    expect(toActivityView(row({ state: 'COMPLETED', lines: ['Shop · x'] }), true).lines).toEqual([])
  })
})

describe('what the work bar reads of a row @SC-972', () => {
  const request = { what: 'Run "git diff"', reason: 'To compare it with last week', askedBy: 'Kernel' }

  it('carries the request only while the work waits for the okay', () => {
    expect(toActivityView(row({ state: 'WAITING_FOR_APPROVAL', request }), true).request).toEqual(request)
    expect(toActivityView(row({ state: 'RUNNING', request }), true).request).toBeNull()
  })

  it('opens the run on the Runs screen once there is one, from this conversation', () => {
    expect(runHrefOf({ runId: 'r1', sessionId: 's1' }, 'c1')).toBe('/runs/r1?session=s1&conversation=c1')
    expect(runHrefOf({ runId: null, sessionId: 's1' }, 'c1')).toBeNull()
    expect(runHrefOf({ runId: 'r1', sessionId: null }, 'c1')).toBeNull()
  })
})
