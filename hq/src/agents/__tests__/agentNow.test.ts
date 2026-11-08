import { describe, it, expect } from 'vitest'
import { nowItems, comingUp, summariseNow, countByState, type WorkTask, type WorkRoutine } from '../agentNow'

const NOW = new Date('2026-10-08T12:00:00.000Z')

let n = 0
const task = (over: Partial<WorkTask> = {}): WorkTask => {
  n++
  return {
    id: `t${n}`, number: n, title: `Task ${n}`, projectId: 'p1', projectKey: 'WEB', projectName: 'Website',
    state: 'TODO', runState: 'RUN_NONE', runStateReason: null, assignedAgentId: 'a1',
    scheduleNextDueAt: null, lastWorkedAt: null, updatedAt: new Date('2026-10-08T11:00:00.000Z'),
    ...over,
  }
}
const routine = (over: Partial<WorkRoutine> = {}): WorkRoutine => ({
  id: 'r1', title: 'Weekly check', projectId: 'p1', projectName: 'Website', enabled: true,
  nextDueAt: new Date('2026-10-12T08:00:00.000Z'), ...over,
})

describe("what an agent is doing now @SC-573", () => {
  it('puts what needs a person before what is running, and leaves out the rest', () => {
    const running = task({ runState: 'RUN_ACTIVE', lastWorkedAt: new Date('2026-10-08T11:48:00.000Z') })
    const blocked = task({ runState: 'RUN_BLOCKED', runStateReason: 'wants to run a command' })
    const failed = task({ runState: 'RUN_FAILED' })
    const failedButDone = task({ runState: 'RUN_FAILED', state: 'DONE' })
    const idle = task()

    const items = nowItems([running, blocked, failed, failedButDone, idle])

    expect(items.map(i => [i.kind, i.taskId])).toEqual([
      ['needsYou', blocked.id], ['needsYou', failed.id], ['running', running.id],
    ])
    expect(items[0]).toMatchObject({ key: `WEB-${blocked.number}`, reason: 'wants to run a command', projectName: 'Website' })
    expect(items[2].since).toBe('2026-10-08T11:48:00.000Z')
  })

  it('leads with needs you, then running, then idle', () => {
    expect(summariseNow([task({ runState: 'RUN_ACTIVE' }), task({ runState: 'RUN_BLOCKED' })], [], NOW))
      .toMatchObject({ state: 'needsYou', needsYouCount: 1, runningCount: 1 })
    expect(summariseNow([task({ runState: 'RUN_ACTIVE' })], [], NOW)).toMatchObject({ state: 'running' })
    expect(summariseNow([task()], [], NOW)).toMatchObject({ state: 'idle', lead: null })
  })

  it('names what starts next: a start time or a routine round, whichever is sooner', () => {
    const soon = task({ scheduleNextDueAt: new Date('2026-10-09T09:00:00.000Z') })
    expect(summariseNow([soon], [routine()], NOW).next).toMatchObject({ kind: 'task', taskId: soon.id, at: '2026-10-09T09:00:00.000Z' })
    expect(summariseNow([], [routine()], NOW).next).toMatchObject({ kind: 'routine', routineId: 'r1' })
  })
})

describe('coming up @SC-573', () => {
  it('lists start times and routine rounds ahead, soonest first, leaving out paused routines and past times', () => {
    const later = task({ scheduleNextDueAt: new Date('2026-10-10T09:00:00.000Z') })
    const past = task({ scheduleNextDueAt: new Date('2026-10-01T09:00:00.000Z') })
    const items = comingUp([later, past], [routine(), routine({ id: 'r2', enabled: false })], NOW)

    expect(items.map(i => i.at)).toEqual(['2026-10-10T09:00:00.000Z', '2026-10-12T08:00:00.000Z'])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => task({ scheduleNextDueAt: new Date(NOW.getTime() + (i + 1) * 60_000) }))
    expect(comingUp(many, [], NOW, 3)).toHaveLength(3)
  })
})

describe('tasks by state @SC-573', () => {
  it('counts by the task’s own state, with needs you and running beside', () => {
    expect(countByState([
      task(), task({ state: 'IN_PROGRESS', runState: 'RUN_ACTIVE' }), task({ state: 'DONE' }), task({ runState: 'RUN_BLOCKED' }),
    ])).toEqual({ todo: 2, inProgress: 1, done: 1, needsYou: 1, running: 1, total: 4 })
  })
})
