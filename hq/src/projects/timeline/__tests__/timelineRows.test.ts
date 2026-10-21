import { describe, it, expect } from 'vitest'
import { buildRows, agendaGroups, todayUtc } from '@agenthix/ui/timeline'
import { data, epic, task, NOW } from './fixtures'

const none = new Set<string>()
const opts = (show: 'tasks' | 'epics' | 'milestones', extra = {}) => ({ show, hiddenBoardIds: none, foldedBoardIds: none, ...extra })
const kinds = (rows: ReturnType<typeof buildRows>) => rows.map(r => r.kind)

describe('what each Show puts on the timeline @SC-566', () => {
  const e1 = epic({ id: 'e1', title: 'Pricing page', milestoneId: 'm1', span: { start: '2026-10-05', finish: '2026-10-20', fromTasks: true } })
  const inEpic = task({ id: 'a', title: 'Table', epicId: 'e1', planStart: '2026-10-06', planFinish: '2026-10-07' })
  const loose = task({ id: 'b', title: 'Loose', planStart: '2026-10-01', planFinish: '2026-10-02' })
  const d = data({
    boards: [
      { id: 'b1', name: 'Project Tasks', kind: 'PROJECT_TASKS', backlogCount: 3, sprints: [] },
      { id: 'b2', name: 'Product', kind: 'SPRINTS', backlogCount: 0, sprints: [{ id: 's1', number: 12, label: 'Sprint 12', startDate: '2026-10-05', finishDate: '2026-10-18', finishedAt: null }] },
    ],
    tasks: [inEpic, loose], epics: [e1],
    milestones: [{ id: 'm1', name: 'Self-serve live', date: '2026-11-30', epicIds: ['e1'] }],
  })

  it('Tasks: a lane per board, tasks under their epic, the rest after, a board with sprints led by them', () => {
    const rows = buildRows(d, opts('tasks'))
    expect(kinds(rows)).toEqual(['lane', 'epic', 'task', 'task', 'lane', 'sprints', 'empty'])
    expect(rows.filter(r => r.kind === 'task').map(r => r.kind === 'task' && r.task.id)).toEqual(['a', 'b'])
    expect(rows[2]).toMatchObject({ kind: 'task', indent: true })
  })

  it('Epics: epics only', () => {
    expect(kinds(buildRows(d, opts('epics')))).toEqual(['lane', 'epic', 'lane', 'sprints', 'empty'])
  })

  it('Milestones: each milestone with its epics under it, and no lanes', () => {
    expect(kinds(buildRows(d, opts('milestones')))).toEqual(['milestone', 'epic'])
  })

  it('Milestones: an epic under no milestone in view is listed apart', () => {
    const stray = epic({ id: 'e2', title: 'Stray' })
    expect(kinds(buildRows(data({ epics: [e1, stray], milestones: d.milestones }), opts('milestones')))).toEqual(['milestone', 'epic', 'heading', 'epic'])
  })

  it('leaves out a lane the person chose to hide, and the rows of a folded one', () => {
    expect(kinds(buildRows(d, opts('tasks', { hiddenBoardIds: new Set(['b2']) })))).toEqual(['lane', 'epic', 'task', 'task'])
    expect(kinds(buildRows(d, opts('tasks', { foldedBoardIds: new Set(['b1']) })))).toEqual(['lane', 'lane', 'sprints', 'empty'])
  })

  it('has no lane header on a board of its own', () => {
    expect(kinds(buildRows(data({ tasks: [loose] }), opts('tasks', { laneHeaders: false })))).toEqual(['task'])
  })

  it('shows a routine\'s rounds on the board it runs on', () => {
    const rows = buildRows(data({ routineRounds: [{ routineId: 'r1', title: 'Weekly report', boardId: 'b1', at: ['2026-10-09T09:00:00Z'], more: false }] }), opts('tasks'))
    expect(kinds(rows)).toEqual(['lane', 'rounds'])
  })
})

describe('the agenda @SC-569', () => {
  const today = todayUtc(NOW)

  it('sorts tasks into this week, next week and later, each with its date', () => {
    const groups = agendaGroups(data({
      tasks: [
        task({ title: 'Late', planStart: '2026-11-02', planFinish: '2026-11-03' }),
        task({ title: 'Now', planStart: '2026-10-07', planFinish: '2026-10-09' }),
        task({ title: 'Next', planStart: '2026-10-13', planFinish: '2026-10-13' }),
        task({ title: 'Timed', startAt: '2026-10-09T09:00:00Z' }),
      ],
    }), today)
    expect(groups.map(g => [g.label, g.lines.map(l => l.task.title)])).toEqual([
      ['This week', ['Now', 'Timed']], ['Next week', ['Next']], ['Later', ['Late']],
    ])
    expect(groups[0]!.lines[0]!.date).toBe('Wed 7 Oct – Fri 9 Oct')
    expect(groups[1]!.lines[0]!.date).toBe('Tue 13 Oct')
  })

  it('keeps a plan still running in this week, leaves out one that is over, and leaves out undated tasks', () => {
    const groups = agendaGroups(data({
      tasks: [
        task({ title: 'Running', planStart: '2026-09-20', planFinish: '2026-10-12' }),
        task({ title: 'Over', planStart: '2026-09-20', planFinish: '2026-09-30' }),
        task({ title: 'Undated' }),
      ],
    }), today)
    expect(groups.flatMap(g => g.lines.map(l => l.task.title))).toEqual(['Running'])
  })
})
