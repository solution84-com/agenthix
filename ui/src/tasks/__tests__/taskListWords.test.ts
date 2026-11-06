import { describe, it, expect } from 'vitest'
import { filterChips, rowChips, rowLine, scorecardsOf, updatedText, withFilter, FILTER_KINDS } from '../taskListWords'
import type { TaskListCounts, TaskListPageData, TaskListRow } from '../taskListTypes'

const counts: TaskListCounts = {
  all: 13,
  needsYou: { count: 2, okay: 1, failed: 1, noAgent: 0 },
  running: { count: 1 },
  waiting: { count: 3 },
  notStarted: { count: 3 },
  done: { count: 4, finished: 0 },
  waitingOn: [{ name: 'Sam Okafor', count: 1 }],
}

describe('the scorecards', () => {
  it('a project’s: each state with its count and breakdown', () => {
    expect(scorecardsOf(counts, 'project').map(c => [c.label, c.count, c.detail])).toEqual([
      ['All', 13, 'in this project'],
      ['Needs you', 2, '1 okay · 1 failed'],
      ['Running', 1, null],
      ['Waiting', 3, '1 on Sam Okafor'],
      ['Not started', 3, 'no run yet'],
      ['Done', 4, 'last 30 days'],
    ])
  })

  it('Your tasks: no Not started, All is for you, and a finished task not moved is said under Done', () => {
    const cards = scorecardsOf({ ...counts, done: { count: 4, finished: 1 } }, 'mine')
    expect(cards.map(c => c.label)).toEqual(['All', 'Needs you', 'Running', 'Waiting', 'Done'])
    expect(cards[0].detail).toBe('for you')
    expect(cards[4].detail).toBe('last 30 days · 1 not moved to Done')
  })
})

const options: TaskListPageData['options'] = {
  agents: [{ id: 'a1', name: 'Writer' }], boards: [{ id: 'b1', name: 'Launch plan' }],
  epics: [{ id: 'e1', name: 'Launch pages' }], queuedBy: [{ id: 'u1', name: 'Priya Nair' }],
  waitingOn: [{ id: 'u2', name: 'Sam Okafor' }], projects: [{ id: 'p1', name: 'Website relaunch' }],
}

describe('the filter chips', () => {
  it('names each filter in use with its value, and ✕ takes it away', () => {
    let f = withFilter({}, 'agent', 'a1')
    f = withFilter(f, 'type', 'epic')
    f = withFilter(f, 'waitingOn', 'u2')
    f = withFilter(f, 'archived', 'yes')
    expect(filterChips(f, 'project', options).map(c => c.label)).toEqual([
      'Type: Epic', 'Agent: Writer', 'Waiting on: Sam Okafor', 'Archived',
    ])
    f = withFilter(f, 'agent', null)
    f = withFilter(f, 'archived', null)
    expect(f).toEqual({ type: 'epic', waitingOnUserId: 'u2' })
  })

  it('Your tasks offers Project, Agent and Priority only', () => {
    expect(FILTER_KINDS.mine).toEqual(['project', 'agent', 'priority'])
    expect(filterChips({ projectId: 'p1', boardId: 'b1' }, 'mine', options).map(c => c.label)).toEqual(['Project: Website relaunch'])
  })

  it('still names a value the list no longer holds', () => {
    expect(filterChips({ epicId: 'gone' }, 'project', options)[0].label).toBe('Epic: one no longer listed')
  })
})

const now = new Date('2026-11-06T12:00:00')
const row = (patch: Partial<TaskListRow>): TaskListRow => ({
  id: 't', key: 'WEB-2', number: 2, title: 'Write the home page copy', priority: 'HIGH', status: 'IN_PROGRESS',
  runState: 'RUN_NONE', runStateReason: null, isEpic: false, columnLabel: 'In progress', board: { id: 'b1', name: 'Launch plan' },
  showBoard: true, project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: null, epic: { id: 'e1', title: 'Launch pages' },
  queuedBy: { you: false, name: 'Priya Nair' }, waitsOn: null, waitsForAgent: false, latestRunCompleted: false,
  workingSince: null, updatedAt: '2026-11-06T11:48:00', createdAt: '2026-11-01T10:00:00', epicDate: null, progress: null,
  ...patch,
})

describe('a row', () => {
  it('a task: its column, priority and epic as chips; key, board, who queued it and when on the line', () => {
    expect(rowChips(row({}), 'project').map(c => c.text)).toEqual(['In progress', 'High', '◆ Launch pages'])
    expect(rowLine(row({}), now)).toBe('WEB-2 · Launch plan · queued by Priya Nair · updated 12 min ago')
  })

  it('Your tasks puts the project first', () => {
    expect(rowChips(row({}), 'mine').map(c => c.text)).toEqual(['Website relaunch', 'In progress', 'High', '◆ Launch pages'])
  })

  it('on no board’s column it says Backlog; with one board in the project it names no board', () => {
    const r = row({ columnLabel: null, showBoard: false, queuedBy: { you: true }, epic: null, priority: 'MEDIUM' })
    expect(rowChips(r, 'project').map(c => c.text)).toEqual(['Backlog', 'Medium'])
    expect(rowLine(r, now)).toBe('WEB-2 · queued by you · updated 12 min ago')
  })

  it('an epic: its date as a chip, and its tasks on the line', () => {
    const epic = row({
      key: 'WEB-20', isEpic: true, epic: null, epicDate: { milestone: 'Launch', at: '2026-11-20T00:00:00Z' },
      progress: { done: 3, total: 5, needsYou: 1 },
    })
    expect(rowChips(epic, 'project').map(c => c.text)).toEqual(['In progress', 'High', 'Launch · 20 Nov'])
    expect(rowLine(epic, now)).toBe('WEB-20 · Launch plan · 5 tasks · 1 needs you · updated 12 min ago')
    expect(rowChips(row({ isEpic: true, epic: null, epicDate: { milestone: null, at: '2026-12-04T00:00:00Z' } }), 'project')[2].text).toBe('Plan · 4 Dec')
  })

  it('says when it changed', () => {
    expect(updatedText('2026-11-06T11:59:40', now)).toBe('just now')
    expect(updatedText('2026-11-06T09:00:00', now)).toBe('3 h ago')
    expect(updatedText('2026-11-05T09:00:00', now)).toBe('yesterday')
    expect(updatedText('2026-11-04T09:00:00', now)).toBe('4 Nov')
  })
})
