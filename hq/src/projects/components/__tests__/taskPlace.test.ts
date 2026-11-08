/** A task's place on its page: the Type and Column chips' choices, and Move to top and Move to bottom (D10, D12, D14). */
import { describe, it, expect } from 'vitest'
import type { TaskState, TaskTypeView, TypeColumnFields } from '@agenthix/core'
import {
  typeChoices, columnChoices, orderNeighbours, startsIn, EPIC_HAS_RUNS, EPIC_IN_AN_EPIC, EPIC_HAS_TASKS, type TypeChoiceTask,
} from '../taskPlace'

const col = (typeId: string, id: string, name: string, state: TaskState, order: number, defaultForState = true): TypeColumnFields =>
  ({ id, typeId, name, colour: 'neutral', order, state, defaultForState })

const type = (id: string, name: string, kind: TaskTypeView['kind'], columns: TypeColumnFields[], archivedAt: Date | null = null): TaskTypeView =>
  ({ id, projectId: 'p', name, icon: kind === 'EPIC' ? 'epic' : 'task', kind, madeFromVersionId: null, archivedAt, columns })

const stateCols = (t: string) => [col(t, `${t}-b`, 'Backlog', 'BACKLOG', 0), col(t, `${t}-t`, 'To do', 'TODO', 1), col(t, `${t}-i`, 'In progress', 'IN_PROGRESS', 2), col(t, `${t}-d`, 'Done', 'DONE', 3)]
const TASK = type('task', 'Task', 'TASK', stateCols('task'))
const EPIC = type('epic', 'Epic', 'EPIC', stateCols('epic'))
const BUG = type('bug', 'Bug', 'CUSTOM', [
  col('bug', 'rep', 'Reported', 'BACKLOG', 0), col('bug', 'tri', 'Triaged', 'TODO', 1),
  col('bug', 'fix', 'Fixing', 'IN_PROGRESS', 2), col('bug', 'ver', 'Verified', 'DONE', 3),
])
const FEATURE = type('fr', 'Feature request', 'CUSTOM', [
  col('fr', 'sub', 'Submitted', 'BACKLOG', 0), col('fr', 'acc', 'Accepted', 'TODO', 1),
  col('fr', 'bld', 'Building', 'IN_PROGRESS', 2), col('fr', 'shp', 'Shipped', 'DONE', 3),
])
const OLD = type('old', 'Old', 'CUSTOM', stateCols('old'), new Date())

const bugInTriaged: TypeChoiceTask = {
  typeId: 'bug', state: 'TODO', isEpic: false, hasRuns: false, inAnEpic: false, hasEpicTasks: false, agentName: 'Writer',
}

describe('the Type chip', () => {
  it('lists the open types, says where a type lands when its column is not named for the state, and that the agent stays on an epic', () => {
    const rows = typeChoices([TASK, BUG, FEATURE, EPIC, OLD], bugInTriaged)
    expect(rows.map(r => r.label)).toEqual(['Task', 'Bug', 'Feature request', 'Epic'])
    expect(rows.find(r => r.label === 'Bug')).toMatchObject({ current: true, hint: undefined })
    expect(rows.find(r => r.label === 'Task')?.hint).toBeUndefined()
    expect(rows.find(r => r.label === 'Feature request')?.hint).toBe('lands on Accepted')
    expect(rows.find(r => r.label === 'Epic')).toMatchObject({ hint: 'Writer stays, to manage it; an epic never runs', disabledWhy: undefined })
  })

  it('greys Epic on a task that has runs, and on one filed under an epic', () => {
    expect(typeChoices([BUG, EPIC], { ...bugInTriaged, hasRuns: true }).find(r => r.label === 'Epic'))
      .toMatchObject({ disabledWhy: EPIC_HAS_RUNS, hint: EPIC_HAS_RUNS })
    expect(typeChoices([BUG, EPIC], { ...bugInTriaged, inAnEpic: true }).find(r => r.label === 'Epic')?.disabledWhy).toBe(EPIC_IN_AN_EPIC)
  })

  it('keeps an epic with tasks under it an epic', () => {
    const rows = typeChoices([TASK, EPIC], { ...bugInTriaged, typeId: 'epic', isEpic: true, hasEpicTasks: true })
    expect(rows.find(r => r.label === 'Task')?.disabledWhy).toBe(EPIC_HAS_TASKS)
    expect(rows.find(r => r.label === 'Epic')?.disabledWhy).toBeUndefined()
  })

  it('still names the task’s own type when that type is archived', () => {
    expect(typeChoices([TASK, OLD], { ...bugInTriaged, typeId: 'old' }).map(r => r.label)).toEqual(['Task', 'Old'])
  })
})

describe('the Column chip', () => {
  it('lists the type’s own columns in order, by name only', () => {
    expect(columnChoices(BUG, 'tri').map(c => [c.label, c.current])).toEqual([
      ['Reported', false], ['Triaged', true], ['Fixing', false], ['Verified', false],
    ])
    expect(columnChoices(null, null)).toEqual([])
  })
})

describe('a new task starts', () => {
  it('in the column it was added from, else in its type’s Backlog column (N2)', () => {
    expect(startsIn(BUG, null)?.name).toBe('Reported')
    expect(startsIn(BUG, 'fix')?.name).toBe('Fixing')
    expect(startsIn(FEATURE, 'fix')?.name).toBe('Submitted')
  })
})

describe('Move to top and Move to bottom (D14)', () => {
  const rows = [
    { id: 'c', number: 3, rank: 'm' }, { id: 'a', number: 1, rank: 'b' }, { id: 'd', number: 4, rank: null }, { id: 'b', number: 2, rank: null },
  ]
  it('places the task before the first and after the last, unranked tasks after the ranked ones by number', () => {
    expect(orderNeighbours(rows, 'c')).toEqual({ top: 'a', bottom: 'd' })
  })
  it('offers nothing where the task is already there, or alone', () => {
    expect(orderNeighbours(rows, 'a').top).toBeNull()
    expect(orderNeighbours(rows, 'd').bottom).toBeNull()
    expect(orderNeighbours([{ id: 'x', number: 1 }], 'x')).toEqual({ top: null, bottom: null })
  })
})
