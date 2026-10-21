/** The Tasks tool's list (every screen reviewed spec §3): three groups, the backlog and the last 30 days of done work. */
import { describe, it, expect } from 'vitest'
import {
  groupTasks, needsPerson, primaryAction, backlogOf, doneRecently, filterTasks, taskAction, taskStateText, plainReason, durationText, NO_TASK_FILTER,
  type ToolTask,
} from '@agenthix/ui/tasks'

let n = 0
function task(over: Partial<ToolTask> = {}): ToolTask {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', status: 'TODO', runState: 'RUN_NONE', runStateReason: null,
    agent: { id: 'a1', name: 'Frontend dev', handle: 'fd' }, board: { id: 'b1', name: 'Sprint 3' }, columnLabel: 'To do',
    project: { id: 'p1', key: 'WEB', name: 'Web' }, waitsForAgent: false, startsAt: null, workingSince: null, doneAt: null, result: null,
    createdAt: `2026-10-0${Math.min(n, 9)}T09:00:00Z`, ...over,
  }
}
const keys = (ts: ToolTask[]) => ts.map(t => t.title)

describe('the three groups @SC-513', () => {
  it('puts a run stopped for a person, and work with no agent to start it, in Needs you', () => {
    const blocked = task({ title: 'blocked', runState: 'RUN_BLOCKED' })
    const failed = task({ title: 'failed', runState: 'RUN_FAILED' })
    const noAgent = task({ title: 'no agent', agent: null, runState: 'RUN_QUEUED', waitsForAgent: true })
    const plain = task({ title: 'plain' })
    expect(keys(groupTasks([plain, blocked, failed, noAgent]).needsYou).sort()).toEqual(['blocked', 'failed', 'no agent'])
  })

  it('puts running tasks in Working on, and not in Up next', () => {
    const g = groupTasks([task({ title: 'going', runState: 'RUN_ACTIVE' }), task({ title: 'idle' })])
    expect(keys(g.workingOn)).toEqual(['going'])
    expect(keys(g.upNext)).toEqual(['idle'])
  })

  it('leaves out done and archived-from-the-board work, and tasks on no board, from Up next', () => {
    const g = groupTasks([
      task({ title: 'done', status: 'DONE' }),
      task({ title: 'backlog', board: null, columnLabel: null }),
      task({ title: 'on a board' }),
    ])
    expect(keys(g.upNext)).toEqual(['on a board'])
    expect(g.needsYou).toEqual([])
  })

  it('orders Up next with what waits to start first, then by priority, then oldest first', () => {
    const g = groupTasks([
      task({ title: 'low idle', priority: 'LOW' }),
      task({ title: 'high idle', priority: 'HIGH' }),
      task({ title: 'queued low', priority: 'LOW', runState: 'RUN_QUEUED' }),
      task({ title: 'scheduled medium', startsAt: '2026-10-09T14:30:00Z' }),
      task({ title: 'older medium idle', createdAt: '2026-09-01T09:00:00Z' }),
      task({ title: 'newer medium idle', createdAt: '2026-10-05T09:00:00Z' }),
    ])
    expect(keys(g.upNext)).toEqual([
      'scheduled medium', 'queued low', 'high idle', 'older medium idle', 'newer medium idle', 'low idle',
    ])
  })

  it('orders Needs you by priority', () => {
    const g = groupTasks([task({ title: 'low', priority: 'LOW', runState: 'RUN_BLOCKED' }), task({ title: 'high', priority: 'HIGH', runState: 'RUN_FAILED' })])
    expect(keys(g.needsYou)).toEqual(['high', 'low'])
  })
})

describe('the action in a row @SC-513', () => {
  it('is Assign with no agent, Review when blocked, Run again when failed, and nothing otherwise', () => {
    expect(taskAction(task({ waitsForAgent: true, agent: null }))).toBe('assign')
    expect(taskAction(task({ runState: 'RUN_BLOCKED' }))).toBe('review')
    expect(taskAction(task({ runState: 'RUN_FAILED' }))).toBe('runAgain')
    expect(taskAction(task({ runState: 'RUN_ACTIVE' }))).toBeNull()
  })
})

describe('the one action of an open task @SC-515', () => {
  it('is Approve when a tool request waits, Stop while it runs or waits to run, Run again after a failure, otherwise Run', () => {
    expect(primaryAction({ runState: 'RUN_BLOCKED', hasPendingApproval: true })).toBe('approve')
    expect(primaryAction({ runState: 'RUN_ACTIVE', hasPendingApproval: false })).toBe('stop')
    expect(primaryAction({ runState: 'RUN_QUEUED', hasPendingApproval: false })).toBe('stop')
    expect(primaryAction({ runState: 'RUN_FAILED', hasPendingApproval: false })).toBe('runAgain')
    expect(primaryAction({ runState: 'RUN_BLOCKED', hasPendingApproval: false })).toBe('runAgain')
    expect(primaryAction({ runState: 'RUN_NONE', hasPendingApproval: false })).toBe('run')
  })
})

describe('the backlog and done @SC-514', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  it('lists tasks on no board by priority, leaving out done ones', () => {
    const rows = [
      task({ title: 'low', board: null, priority: 'LOW' }),
      task({ title: 'high', board: null, priority: 'HIGH' }),
      task({ title: 'done', board: null, status: 'DONE' }),
      task({ title: 'boarded' }),
    ]
    expect(keys(backlogOf(rows))).toEqual(['high', 'low'])
  })

  it('lists the last 30 days of done work, newest first', () => {
    const rows = [
      task({ title: 'old', status: 'DONE', doneAt: '2026-08-01T10:00:00Z' }),
      task({ title: 'earlier', status: 'DONE', doneAt: '2026-10-01T10:00:00Z' }),
      task({ title: 'latest', status: 'DONE', doneAt: '2026-10-06T10:00:00Z' }),
      task({ title: 'open' }),
    ]
    expect(keys(doneRecently(rows, now))).toEqual(['latest', 'earlier'])
  })
})

describe('filtering @SC-513', () => {
  it('matches the title or key, and the agent, board and priority', () => {
    const a = task({ title: 'Pricing table', priority: 'HIGH' })
    const b = task({ title: 'Sitemap', agent: { id: 'a2', name: 'Copywriter', handle: 'cw' }, board: { id: 'b2', name: 'Launch' } })
    expect(keys(filterTasks([a, b], { ...NO_TASK_FILTER, search: 'pricing' }))).toEqual(['Pricing table'])
    expect(keys(filterTasks([a, b], { ...NO_TASK_FILTER, search: b.key.toLowerCase() }))).toEqual(['Sitemap'])
    expect(keys(filterTasks([a, b], { ...NO_TASK_FILTER, agentId: 'a2' }))).toEqual(['Sitemap'])
    expect(keys(filterTasks([a, b], { ...NO_TASK_FILTER, boardId: 'b2' }))).toEqual(['Sitemap'])
    expect(keys(filterTasks([a, b], { ...NO_TASK_FILTER, priority: 'HIGH' }))).toEqual(['Pricing table'])
  })
})

describe('the words for a task @SC-513', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  it('says how long a running task has been going', () => {
    expect(taskStateText(task({ runState: 'RUN_ACTIVE', workingSince: '2026-10-07T11:48:00Z' }), now))
      .toEqual({ text: 'Running · 12 min', tone: 'live' })
  })
  it('says why a task needs a person', () => {
    expect(taskStateText(task({ waitsForAgent: true }), now).text).toBe("Couldn't start — no agent")
    expect(taskStateText(task({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' }), now))
      .toEqual({ text: 'Wants approval', tone: 'needs' })
  })
  it('says what a waiting task waits for', () => {
    expect(taskStateText(task({ runState: 'RUN_QUEUED' }), now).text).toBe('In line')
    expect(taskStateText(task(), now).text).toBe('Waiting its turn')
    expect(taskStateText(task({ startsAt: '2026-10-07T15:30:00' }), now).text).toBe('Starts 15:30')
  })
  it('writes a duration in minutes, hours and days', () => {
    expect(durationText(30_000)).toBe('1 min')
    expect(durationText(125 * 60_000)).toBe('2 h 5 min')
    expect(durationText(3 * 24 * 60 * 60_000)).toBe('3 days')
  })
})

describe('one definition of Needs you @SC-513 @SC-517', () => {
  it('counts a run waiting for approval whatever its task\'s column or status', () => {
    expect(needsPerson({ status: 'DONE', runState: 'RUN_BLOCKED' })).toBe(true)
    expect(keys(groupTasks([task({ title: 'in the done column', status: 'DONE', runState: 'RUN_BLOCKED' })]).needsYou)).toEqual(['in the done column'])
  })

  it('counts a failed run or work with no agent only while the task is open', () => {
    expect(needsPerson({ status: 'TODO', runState: 'RUN_FAILED' })).toBe(true)
    expect(needsPerson({ status: 'TODO', runState: 'RUN_NONE', waitsForAgent: true })).toBe(true)
    expect(needsPerson({ status: 'DONE', runState: 'RUN_FAILED' })).toBe(false)
    expect(needsPerson({ status: 'TODO', runState: 'RUN_ACTIVE' })).toBe(false)
  })
})

describe('plainReason @SC-513 @SC-524', () => {
  it('words the reasons hq stores for a person, and leaves an unknown one as it is', () => {
    expect(plainReason('manifest rejected — awaiting human review')).toBe('Request denied — run again to retry')
    expect(plainReason('site unreachable — held for reconnect')).toBe('Site unreachable — held until it reconnects')
    expect(plainReason('reached its 30 min limit')).toBe('reached its 30 min limit')
  })
  it('is what the Tasks tool shows for a blocked task', () => {
    const blocked = task({ runState: 'RUN_BLOCKED', runStateReason: 'manifest rejected — awaiting human review' })
    expect(taskStateText(blocked, new Date()).text).toBe('Request denied — run again to retry')
  })
})
