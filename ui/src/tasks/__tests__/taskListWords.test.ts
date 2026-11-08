import { describe, it, expect } from 'vitest'
import {
  dueGroupOf, dueText, epicStateText, filterChips, filterKindsOf, groupByDue, narrowedLine, rowLine, scorecardsOf, todayText,
  updatedText, withFilter, SORTS,
} from '../taskListWords'
import { columnsTemplate, orderedColumns, parseColumns, toggleColumn } from '../taskListColumns'
import type { TaskListCounts, TaskListPageData, TaskListRow } from '../taskListTypes'

const counts: TaskListCounts = { all: 33, backlog: 9, todo: 7, inProgress: 6, done: 11, late: 1, noAgent: 8 }

describe('the scorecards (T1)', () => {
  it('a project’s: All, the task states with Backlog first, then Late and No agent', () => {
    expect(scorecardsOf(counts, 'project').map(c => [c.label, c.count, c.detail])).toEqual([
      ['All', 33, 'in this project'],
      ['Backlog', 9, 'not committed yet'],
      ['To do', 7, null],
      ['In progress', 6, null],
      ['Done', 11, 'last 30 days'],
      ['Late', 1, 'past its due date'],
      ['No agent', 8, null],
    ])
  })

  it('Your tasks: the same cards for you, with no No agent and no run state', () => {
    const cards = scorecardsOf(counts, 'mine')
    expect(cards.map(c => c.label)).toEqual(['All', 'Backlog', 'To do', 'In progress', 'Done', 'Late'])
    expect(cards[0].detail).toBe('for you')
  })

  it('a narrowed list says what it shows against what it holds', () => {
    expect(narrowedLine({ shown: 4, total: 33 })).toBe('4 of 33 tasks')
    expect(narrowedLine(null)).toBeNull()
  })
})

describe('the orders (D14)', () => {
  it('a project sorts by Rank first; Your tasks by due date and offers no Rank', () => {
    expect(SORTS.project.map(s => s.label)).toEqual(['Rank', 'Priority', 'Due date', 'Recently updated', 'Newest'])
    expect(SORTS.mine.map(s => s.sort)).toEqual(['due', 'priority', 'updated', 'newest'])
  })
})

const options: TaskListPageData['options'] = {
  types: [{ id: 'Bug', name: 'Bug' }, { id: 'Task', name: 'Task' }], columns: [{ id: 'Reported', name: 'Reported' }],
  epics: [{ id: 'e1', name: 'Launch pages' }], sprints: [{ id: 's4', name: 'Sprint 4' }], agents: [{ id: 'a1', name: 'Writer' }],
  projects: [{ id: 'p1', name: 'Website relaunch' }], fields: [{ id: 'f1', name: 'Launch stage', options: [{ id: 'o1', name: 'Copy' }] }],
}

describe('the filter chips (T3)', () => {
  it('names each filter in use with its value, and ✕ takes it away', () => {
    let f = withFilter({}, 'agent', 'a1')
    f = withFilter(f, 'type', 'Bug')
    f = withFilter(f, 'state', 'BACKLOG')
    f = withFilter(f, 'field:f1', 'o1')
    f = withFilter(f, 'archived', 'yes')
    expect(filterChips(f, 'project', options).map(c => c.label)).toEqual([
      'Type: Bug', 'Task state: Backlog', 'Agent: Writer', 'Launch stage: Copy', 'Archived',
    ])
    f = withFilter(f, 'agent', null)
    f = withFilter(f, 'field:f1', null)
    f = withFilter(f, 'archived', null)
    expect(f).toEqual({ type: 'Bug', state: 'BACKLOG' })
  })

  it('Your tasks offers Project first, and no custom field', () => {
    expect(filterKindsOf('mine', options)).toEqual(['project', 'type', 'column', 'epic', 'sprint', 'agent', 'priority'])
    expect(filterKindsOf('project', options)).toContain('field:f1')
  })

  it('still names a value the list no longer holds, and an option whose field is gone', () => {
    expect(filterChips({ epicId: 'gone' }, 'project', options)[0].label).toBe('Epic: one no longer listed')
    const orphan = filterChips({ optionId: 'gone' }, 'project', options)
    expect(orphan.map(c => c.label)).toEqual(['Field: one no longer listed'])
    expect(withFilter({ optionId: 'gone' }, orphan[0].kind, null)).toEqual({})
  })
})

const now = new Date('2026-11-06T12:00:00') // a Friday
const row = (patch: Partial<TaskListRow>): TaskListRow => ({
  id: 't', key: 'WEB-2', number: 2, title: 'Write the home page copy', priority: 'HIGH', state: 'IN_PROGRESS', executionState: null,
  type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c1', name: 'In progress' },
  project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: null, runDetail: null, epic: { id: 'e1', title: 'Launch pages' },
  sprint: null, due: null, late: false, fields: {}, updatedAt: '2026-11-06T11:48:00', createdAt: '2026-11-01T10:00:00', progress: null,
  ...patch,
})

describe('a line (T2)', () => {
  it('a task: key · type · when it changed; Your tasks leaves out when', () => {
    expect(rowLine(row({ type: { name: 'Bug', icon: 'bug', kind: 'CUSTOM' } }), now)).toBe('WEB-2 · Bug · updated 12 min ago')
    expect(rowLine(row({}), now, { kind: 'mine' })).toBe('WEB-2 · Task')
  })

  it('an epic: its tasks, and while planning them by state', () => {
    const epic = row({ key: 'WEB-20', type: { name: 'Epic', icon: 'epic', kind: 'EPIC' }, progress: { done: 3, total: 6, backlog: 0, todo: 1, inProgress: 2 } })
    expect(rowLine(epic, now)).toBe('WEB-20 · Epic · 6 tasks · updated 12 min ago')
    expect(rowLine(epic, now, { byState: true })).toBe('WEB-20 · Epic · 6 tasks · 2 in progress · 1 to do')
    expect(epicStateText({ done: 0, total: 3, backlog: 3, todo: 0, inProgress: 0 })).toBe('all in Backlog')
  })

  it('says when it changed', () => {
    expect(updatedText('2026-11-06T11:59:40', now)).toBe('just now')
    expect(updatedText('2026-11-06T09:00:00', now)).toBe('3 h ago')
    expect(updatedText('2026-11-05T09:00:00', now)).toBe('yesterday')
    expect(updatedText('2026-11-04T09:00:00', now)).toBe('4 Nov')
  })

  it('writes when it is due, a late one with Late', () => {
    expect(dueText(row({ due: '2026-11-12' }), now)).toBe('12 Nov')
    expect(dueText(row({ due: '2026-11-04', late: true }), now)).toBe('Late · 4 Nov')
    expect(dueText(row({}), now)).toBeNull()
  })
})

describe('Your tasks by when (Y1)', () => {
  it('breaks by Late, This week, Next week, Later and No date, each only when it holds a line', () => {
    expect(dueGroupOf(row({ due: '2026-11-04', late: true }), now)).toBe('Late')
    expect(dueGroupOf(row({ due: '2026-11-08' }), now)).toBe('This week')
    expect(dueGroupOf(row({ due: '2026-11-03' }), now)).toBe('This week')
    expect(dueGroupOf(row({ due: '2026-11-09' }), now)).toBe('Next week')
    expect(dueGroupOf(row({ due: '2026-11-16' }), now)).toBe('Later')
    expect(dueGroupOf(row({}), now)).toBe('No date')
    expect(groupByDue([row({ due: '2026-11-20' }), row({})], now).map(g => g.group)).toEqual(['Later', 'No date'])
  })

  it('names the reader’s day as hq measures Late against it', () => {
    expect(todayText(new Date(2026, 10, 7, 23, 30))).toBe('2026-11-07')
  })
})

describe('the columns (Fields ▾)', () => {
  const fields = [{ id: 'f2', name: 'Audience', options: [] }, { id: 'f1', name: 'Launch stage', options: [] }]
  it('stand Column first, then the custom fields in the project’s order, then Sprint, Priority, Agent and Due', () => {
    expect(orderedColumns(['due', 'agent', 'field:f1', 'priority', 'column', 'field:f2'], fields)).toEqual(['column', 'field:f2', 'field:f1', 'priority', 'agent', 'due'])
    expect(orderedColumns(['column', 'field:gone'], fields)).toEqual(['column'])
  })

  it('make the wide line’s grid, with the tick first when lines can be ticked', () => {
    expect(columnsTemplate(['column', 'agent', 'due'], false)).toBe('minmax(0,1fr) 8.5rem 9.5rem 6.5rem')
    expect(columnsTemplate(['column'], true)).toBe('24px minmax(0,1fr) 8.5rem')
  })

  it('toggle, and read back only what they know', () => {
    expect(toggleColumn(['column', 'agent'], 'agent')).toEqual(['column'])
    expect(toggleColumn(['column'], 'sprint')).toEqual(['column', 'sprint'])
    expect(parseColumns(['column', 'nonsense', 'field:f1', 3])).toEqual(['column', 'field:f1'])
    expect(parseColumns('column')).toBeNull()
  })
})
