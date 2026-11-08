import { describe, expect, it } from 'vitest'
import type { ViewCardData, ViewColumnData } from '@agenthix/ui/board'
import type { BoardChoices } from '../../boardChoices'
import {
  applyOverrides, BUILT_IN_SPECS, columnsAreTheStates, countsLine, filterWords, isChanged, overridesFor, type ViewSpec,
} from '../boardViewModel'
import { cardMenu, ASSIGN_AN_AGENT_FIRST, THE_SYSTEM_MOVES_THESE, type CardMenuContext } from '../boardCardMenu'
import { finishingColumn, movedColumns, slotWords } from '../boardCards'
import { screenOf } from '../useBoardsToolUrl'

const col = (id: string, name: string, state: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE', defaultForState = true) =>
  ({ id, typeId: 'x', name, colour: 'neutral' as const, order: 0, state, defaultForState })

const choices: BoardChoices = {
  types: [
    { id: 'task', projectId: 'p', name: 'Task', icon: 'task', kind: 'TASK', madeFromVersionId: null, archivedAt: null,
      columns: [col('t1', 'Backlog', 'BACKLOG'), col('t2', 'To do', 'TODO'), col('t3', 'In progress', 'IN_PROGRESS'), col('t4', 'Done', 'DONE')] },
    { id: 'feat', projectId: 'p', name: 'Feature request', icon: 'feature', kind: 'CUSTOM', madeFromVersionId: null, archivedAt: null,
      columns: [col('f1', 'Submitted', 'BACKLOG'), col('f2', 'Accepted', 'TODO'), col('f3', 'Building', 'IN_PROGRESS'), col('f4', 'Shipped', 'DONE')] },
  ],
  fields: [],
  epics: [{ id: 'e1', key: 'WEB-20', name: 'Launch pages' }],
  agents: [{ id: 'w', name: 'Writer' }],
  sprints: { current: { id: 's4', name: 'Sprint 4' }, upcoming: [{ id: 's5', name: 'Sprint 5' }], past: [] },
}

const bugs: ViewSpec = { kind: 'TYPE', typeId: 'feat', fieldId: null, filter: {} }

describe('the view a board shows', () => {
  it('is what was saved, with what the address changes; a cleared part is "any"', () => {
    const saved: ViewSpec = { ...bugs, filter: { sprint: { current: true }, epicId: 'e1' } }
    const view = applyOverrides(saved, { epic: 'any', agent: 'w' })
    expect(view.filter).toEqual({ sprint: { current: true }, agentId: 'w' })
    expect(isChanged(saved, view)).toBe(true)
    expect(overridesFor(saved, view)).toEqual({ epic: 'any', agent: 'w' })
    expect(isChanged(saved, applyOverrides(saved, {}))).toBe(false)
  })

  it('changes its columns, and a type board drops a Type filter', () => {
    const view = applyOverrides({ ...BUILT_IN_SPECS.state, filter: { typeId: 'feat', sprint: { none: true } } }, { cols: 'type:feat' })
    expect(view).toEqual({ kind: 'TYPE', typeId: 'feat', fieldId: null, filter: { sprint: { none: true } } })
  })

  it('is said in words, with how many of its tasks are shown', () => {
    expect(filterWords({ sprint: { current: true }, epicId: 'e1' }, choices)).toEqual(['Sprint: current', 'Epic: Launch pages'])
    expect(countsLine(bugs, choices, { total: 16, shown: 16 }, true)).toBe("Feature request's columns · every sprint, epic and agent · 16 tasks")
    expect(countsLine({ ...bugs, filter: { sprint: { current: true } } }, choices, { total: 16, shown: 4 }, true))
      .toBe("Feature request's columns · Sprint: current · 4 of 16 tasks shown")
    expect(countsLine({ ...bugs, filter: { sprint: { current: true } } }, choices, { total: 0, shown: 0 }, false))
      .toBe("Not saved yet · Feature request's columns · Sprint: current")
  })

  it('lists a type in Columns only when its columns differ from the four states', () => {
    expect(columnsAreTheStates(choices.types[0]!)).toBe(true)
    expect(columnsAreTheStates(choices.types[1]!)).toBe(false)
  })
})

describe('the address of a board', () => {
  it('names the board, the view changed on it, and a task opened from it', () => {
    expect(screenOf(new URLSearchParams(''))).toEqual({ kind: 'list' })
    expect(screenOf(new URLSearchParams('board=state&bsprint=current'))).toEqual({ kind: 'board', board: 'state', overrides: { sprint: 'current' } })
    expect(screenOf(new URLSearchParams('board=b1&btask=WEB-14'))).toEqual({ kind: 'task', board: 'b1', overrides: {}, taskKey: 'WEB-14' })
  })
})

const card = (over: Partial<ViewCardData> = {}): ViewCardData => ({
  id: 'c1', key: 'WEB-105', title: 'Newsletter sign-up', priority: 'MEDIUM',
  type: { id: 'feat', name: 'Feature request', icon: 'feature', kind: 'CUSTOM' }, state: 'BACKLOG', executionState: 'NOT_STARTED',
  agent: { id: 'w', name: 'Writer' }, ...over,
})
const columns: ViewColumnData[] = [
  { key: 'BACKLOG', name: 'Backlog', state: 'BACKLOG', count: 1, cards: [card()] },
  { key: 'TODO', name: 'To do', state: 'TODO', count: 1, cards: [card({ id: 'c2', key: 'WEB-17', state: 'TODO' })] },
]

describe('a drop and its slot', () => {
  it('on the task state board says which of the type\'s columns a card lands in', () => {
    expect(slotWords(BUILT_IN_SPECS.state, choices, columns, card(), { column: 'TODO', index: 0 })).toBe("Lands in Accepted, Feature request's To do column")
    expect(slotWords(BUILT_IN_SPECS.state, choices, columns, card(), { column: 'BACKLOG', index: 0 })).toBe('Drops here · Backlog, 1st')
  })
  it('draws the moved card at once in its new place', () => {
    const moved = movedColumns(columns, 'c1', 'TODO', { afterTaskId: 'c2', beforeTaskId: null })
    expect(moved.map(c => c.cards.map(x => x.id))).toEqual([[], ['c2', 'c1']])
    expect(moved.map(c => c.count)).toEqual([0, 2])
  })
  it('folds the columns that finish the work', () => {
    expect(finishingColumn(BUILT_IN_SPECS.state, { key: 'DONE', name: 'Done', state: 'DONE', count: 0, cards: [] })).toBe(true)
    expect(finishingColumn(BUILT_IN_SPECS.execution, { key: 'FINISHED', name: 'Finished', state: null, count: 0, cards: [] })).toBe(true)
    expect(finishingColumn(BUILT_IN_SPECS.state, columns[0]!)).toBe(false)
  })
})

describe("a card's ⋯", () => {
  const ctx = (over: Partial<CardMenuContext> = {}): CardMenuContext => ({
    columns, readOnly: false, mayWork: true, choices, sprintOf: () => null, phone: false,
    on: { open: () => {}, run: () => {}, stop: () => {}, openInRuns: () => {}, moveTo: () => {}, setSprint: () => {} }, ...over,
  })
  const labels = (items: ReturnType<typeof cardMenu>) => items.map(i => i.label)

  it('runs a card not started, stops a running one, and runs a failed one again; never an epic', () => {
    expect(labels(cardMenu(card(), ctx()))).toEqual(['Open', 'Run', 'Move to', 'Sprint'])
    expect(labels(cardMenu(card({ executionState: 'RUNNING' }), ctx()))).toEqual(['Open', 'Stop', 'Open in Runs', 'Move to', 'Sprint'])
    expect(labels(cardMenu(card({ executionState: 'FAILED' }), ctx()))).toContain('Run again')
    expect(labels(cardMenu(card({ executionState: 'NEEDS_YOU' }), ctx()))).not.toContain('Run')
    expect(labels(cardMenu(card({ type: { id: 'e', name: 'Epic', icon: 'epic', kind: 'EPIC' } }), ctx()))).toEqual(['Open', 'Move to'])
  })

  it('greys Run with why on a card with no agent, and Move to on the execution board', () => {
    expect(cardMenu(card({ agent: null }), ctx()).find(i => i.label === 'Run')?.disabledReason).toBe(ASSIGN_AN_AGENT_FIRST)
    expect(cardMenu(card(), ctx({ readOnly: true })).find(i => i.label === 'Move to')?.disabledReason).toBe(THE_SYSTEM_MOVES_THESE)
  })

  it('on a phone, puts Run first and adds Move up and Move down', () => {
    expect(labels(cardMenu(card(), ctx({ phone: true })))).toEqual(['Run', 'Open', 'Move to', 'Move up', 'Move down', 'Sprint'])
  })
})
