import { describe, it, expect } from 'vitest'
import { WAITING_FOR_SLOT_REASON } from '../../agents/taskExecutionReasons'
import { lineRows, lineRowId, type LineTaskRow } from '../historyLineRows'

const NOW = new Date('2026-11-07T12:00:00Z')
const writer = { id: 'w', name: 'Writer', avatarUrl: null }
let n = 0
const task = (over: Partial<LineTaskRow> = {}): LineTaskRow => ({
  id: `t${++n}`, title: `Task ${n}`, runState: 'RUN_QUEUED', runStateReason: null, scheduleNextDueAt: null,
  projectId: 'p', number: n, runCount: 0, updatedAt: NOW, runStartedBy: 'person', queuedByUserId: 'me', queuedByAgentId: null,
  onBehalfOfUserId: 'me', runOnBehalfOfUserId: null, project: { key: 'WEB', name: 'Website relaunch' }, assignedAgent: writer, ...over,
})
const names = { users: new Map([['kai', 'Kai']]), agents: new Map<string, string>() }

describe('the Runs history’s Waiting rows: the tasks in line, as the Workroom counts them', () => {
  it('lists each task in an agent’s line as Waiting, with the one reason its card gives', () => {
    const atWork = task({ title: 'Fix the contact form', runState: 'RUN_ACTIVE', runCount: 1 })
    const next = task({ title: 'Draft the case-study page' })
    const later = task({ title: 'Collect quotes', runState: 'RUN_NONE', scheduleNextDueAt: new Date('2026-11-07T14:00:00Z'), runStartedBy: 'schedule' })
    const rows = lineRows([atWork, next, later], new Map([['p', 'fernhill-hq']]), 'me', names, NOW)
    expect(rows.map(r => r.taskKey)).toEqual([`WEB-${next.number}`, `WEB-${later.number}`])
    expect(rows[0]).toMatchObject({
      runId: lineRowId(next.id), group: 'waiting', ring: 'WAITING', number: 1, openable: false, href: `/tasks/WEB-${next.number}`,
      why: { kind: 'next', after: 'Fix the contact form' }, startedBy: 'you',
    })
    expect(rows[1]).toMatchObject({ why: { kind: 'startsAt', at: '2026-11-07T14:00:00.000Z' }, startedBy: 'at its start time' })
  })

  it('says a task its site holds waits for the site, under that run’s number', () => {
    const held = task({ runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON, runCount: 2, queuedByUserId: 'kai' })
    const rows = lineRows([held], new Map([['p', 'fernhill-hq']]), 'me', names, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ number: 2, why: { kind: 'siteBusy', siteName: 'fernhill-hq' }, startedBy: 'Kai' })
  })

  it('leaves out a task with no agent, and one whose start time has passed without starting', () => {
    expect(lineRows([task({ assignedAgent: null }), task({ runState: 'RUN_NONE', scheduleNextDueAt: new Date('2026-11-07T11:00:00Z') })], new Map(), 'me', names, NOW)).toEqual([])
  })
})
