import { describe, it, expect } from 'vitest'
import { laterInOrder, stuckOf } from '../outlookPlan'

const NOW = new Date('2026-10-06T10:00:00Z')
const at = (iso: string) => new Date(iso)

const routine = (id: string, title: string, nextRoundAt: Date | null, enabled = true) => ({ id, title, nextRoundAt, enabled })
const task = (id: string, number: number, title: string, scheduleNextDueAt: Date | null) => ({ id, number, title, scheduleNextDueAt })

describe("Later: what will start, in time order @SC-511", () => {
  it("interleaves each routine's next run with the start times set on tasks, earliest first", () => {
    const { items } = laterInOrder({
      projectKey: 'WEB',
      routines: [routine('r1', 'Weekly report', at('2026-10-12T10:00:00Z')), routine('r2', 'Daily site audit', at('2026-10-07T09:00:00Z'))],
      tasks: [task('t1', 33, 'Generate sitemap', at('2026-10-08T14:30:00Z'))],
      now: NOW,
    })
    expect(items).toEqual([
      { kind: 'routine', at: '2026-10-07T09:00:00.000Z', routineId: 'r2', title: 'Daily site audit' },
      { kind: 'task', at: '2026-10-08T14:30:00.000Z', taskId: 't1', key: 'WEB-33', title: 'Generate sitemap' },
      { kind: 'routine', at: '2026-10-12T10:00:00.000Z', routineId: 'r1', title: 'Weekly report' },
    ])
  })

  it('leaves out a routine that is switched off, and anything with no time or a time already past', () => {
    const { items } = laterInOrder({
      projectKey: 'WEB',
      routines: [routine('off', 'Paused one', at('2026-10-07T09:00:00Z'), false), routine('none', 'No time', null)],
      tasks: [task('past', 1, 'Past', at('2026-10-06T09:59:00Z')), task('unset', 2, 'Unset', null)],
      now: NOW,
    })
    expect(items).toEqual([])
  })

  it('orders two starts at the same time by name, so the list does not shuffle', () => {
    const same = at('2026-10-07T09:00:00Z')
    const { items } = laterInOrder({
      projectKey: 'WEB',
      routines: [routine('b', 'Beta', same)],
      tasks: [task('a', 1, 'Alpha', same)],
      now: NOW,
    })
    expect(items.map(i => i.title)).toEqual(['Alpha', 'Beta'])
  })

  it('keeps the first few and counts the rest', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, i + 1, `Task ${i}`, new Date(NOW.getTime() + (i + 1) * 3_600_000)))
    const { items, more } = laterInOrder({ projectKey: 'WEB', routines: [], tasks, now: NOW, limit: 3 })
    expect(items.map(i => i.title)).toEqual(['Task 0', 'Task 1', 'Task 2'])
    expect(more).toBe(2)
  })
})

describe('Now: what is stuck, named with its fix @SC-511', () => {
  it('names a queued task with no agent, a task whose person lost access, and a routine paused for a reason', () => {
    const stuck = stuckOf({
      projectKey: 'WEB',
      tasks: [
        { id: 't23', number: 23, title: 'Fix nav', runState: 'RUN_QUEUED', runStateReason: null, assignedAgentId: null },
        { id: 't24', number: 24, title: 'Audit', runState: 'RUN_BLOCKED', runStateReason: 'LOST', assignedAgentId: 'a' },
        { id: 't25', number: 25, title: 'Report', runState: 'RUN_NONE', runStateReason: 'NO_AGENT', assignedAgentId: null },
      ],
      routines: [{ id: 'r1', title: 'Daily site audit', pausedReason: 'its person lost access' }],
      reasons: { lostAccess: 'LOST', noAgent: 'NO_AGENT' },
    })
    expect(stuck).toEqual([
      { kind: 'noAgent', taskId: 't23', key: 'WEB-23', title: 'Fix nav' },
      { kind: 'lostAccess', taskId: 't24', key: 'WEB-24', title: 'Audit' },
      { kind: 'noAgent', taskId: 't25', key: 'WEB-25', title: 'Report' },
      { kind: 'routinePaused', routineId: 'r1', title: 'Daily site audit', reason: 'its person lost access' },
    ])
  })

  it('says nothing of a task that is moving or a queued task with an agent', () => {
    expect(stuckOf({
      projectKey: 'WEB',
      tasks: [{ id: 't1', number: 1, title: 'Fine', runState: 'RUN_QUEUED', runStateReason: null, assignedAgentId: 'a' }],
      routines: [],
      reasons: { lostAccess: 'LOST', noAgent: 'NO_AGENT' },
    })).toEqual([])
  })
})
