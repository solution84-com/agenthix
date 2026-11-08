/**
 * The board's Columns menu and its filters (the board design, keys 2 and 3, Board filters, and the Columns menu open):
 * Task state; a type's own columns (only types whose columns differ from the four states); a custom field; the
 * execution state, read-only. Then Sprint (Any, Current sprint, which follows to the next one, the next sprints, Not
 * in a sprint, Past sprints ›), Epic, Agent, and a Type filter on a board that spans types.
 */
import type { BoardFilterControl, BoardMenuItem } from '@agenthix/ui/board'
import type { BoardFilter } from '@agenthix/core'
import type { BoardChoices } from '../boardChoices'
import { colsOf, columnsAreTheStates, filterTexts, sprintValue, type ViewSpec } from './boardViewModel'

export function columnsMenu(view: ViewSpec, choices: BoardChoices | undefined, choose: (next: ViewSpec) => void): BoardMenuItem[] {
  const now = colsOf(view)
  const pick = (shape: Pick<ViewSpec, 'kind' | 'typeId' | 'fieldId'>): ViewSpec => {
    const filter: BoardFilter = { ...view.filter }
    if (shape.kind === 'TYPE') delete filter.typeId
    return { ...shape, filter }
  }
  const types = (choices?.types ?? []).filter(t => !columnsAreTheStates(t) || now === `type:${t.id}`)
  const fields = choices?.fields ?? []
  return [
    {
      key: 'state', label: 'Task state', hint: 'every type · Backlog · To do · In progress · Done', checked: now === 'state',
      onSelect: () => choose(pick({ kind: 'STATE', typeId: null, fieldId: null })),
    },
    ...types.map((t, i) => ({
      key: `type:${t.id}`, label: t.name, hint: t.columns.map(c => c.name).join(' · '), checked: now === `type:${t.id}`,
      groupBefore: i === 0 ? "A type's own columns" : undefined,
      onSelect: () => choose(pick({ kind: 'TYPE', typeId: t.id, fieldId: null })),
    })),
    ...fields.map((f, i) => ({
      key: `field:${f.id}`, label: f.name, hint: f.options.map(o => o.name).join(' · ') || 'no options yet', checked: now === `field:${f.id}`,
      groupBefore: i === 0 ? 'A custom field' : undefined, separatorBefore: i === 0,
      onSelect: () => choose(pick({ kind: 'FIELD', typeId: null, fieldId: f.id })),
    })),
    {
      key: 'execution', label: 'Execution state', badge: 'Read-only', hint: 'the system moves the cards', checked: now === 'execution',
      groupBefore: "The system's", separatorBefore: true,
      onSelect: () => choose(pick({ kind: 'EXECUTION', typeId: null, fieldId: null })),
    },
  ]
}

function withFilter(view: ViewSpec, change: (f: BoardFilter) => void): ViewSpec {
  const filter: BoardFilter = { ...view.filter }
  change(filter)
  return { ...view, filter }
}

export function filterControls(view: ViewSpec, choices: BoardChoices | undefined, choose: (next: ViewSpec) => void): BoardFilterControl[] {
  const texts = filterTexts(view.filter, choices)
  const sprints = choices?.sprints
  const sprintNow = sprintValue(view.filter.sprint)
  const setSprint = (sprint: BoardFilter['sprint']) => choose(withFilter(view, f => { if (sprint) f.sprint = sprint; else delete f.sprint }))
  const noSprints = !sprints?.current && (sprints?.upcoming.length ?? 0) === 0
  const sprint: BoardFilterControl = {
    id: 'sprint', label: 'Sprint', value: texts.sprint,
    onClear: () => setSprint(undefined),
    choices: [
      { key: 'any', label: 'Any sprint', checked: sprintNow === 'any', onSelect: () => setSprint(undefined) },
      {
        key: 'current', label: 'Current sprint', checked: sprintNow === 'current',
        hint: sprints?.current ? `${sprints.current.name} · follows to the next one` : 'This project has no sprints yet',
        disabledReason: noSprints ? 'This project has no sprints yet: start them on Sprints' : undefined,
        onSelect: () => setSprint({ current: true }),
      },
      ...(sprints?.upcoming ?? []).map((s, i) => ({
        key: s.id, label: s.name, hint: i === 0 ? 'next' : undefined, checked: sprintNow === s.id, onSelect: () => setSprint({ sprintId: s.id }),
      })),
      { key: 'none', label: 'Not in a sprint', checked: sprintNow === 'none', onSelect: () => setSprint({ none: true }) },
      ...((sprints?.past.length ?? 0) > 0 ? [{
        key: 'past', label: 'Past sprints', separatorBefore: true,
        choices: sprints!.past.map(s => ({ label: s.name, checked: sprintNow === s.id, onSelect: () => setSprint({ sprintId: s.id }) })),
      }] : []),
    ],
  }
  const one = (id: 'epic' | 'agent' | 'type', label: string, list: { id: string; name: string; key?: string }[], field: 'epicId' | 'agentId' | 'typeId', none: string): BoardFilterControl => {
    const set = (value: string | undefined) => choose(withFilter(view, f => { if (value) f[field] = value; else delete f[field] }))
    return {
      id, label, value: texts[id], onClear: () => set(undefined),
      choices: [
        { key: 'any', label: `Any ${label.toLowerCase()}`, checked: !view.filter[field], onSelect: () => set(undefined) },
        ...list.map(x => ({ key: x.id, label: x.key ? `${x.key} · ${x.name}` : x.name, checked: view.filter[field] === x.id, onSelect: () => set(x.id) })),
        ...(list.length === 0 ? [{ key: 'none', label: none, disabledReason: none }] : []),
      ],
    }
  }
  return [
    sprint,
    one('epic', 'Epic', choices?.epics ?? [], 'epicId', 'This project has no epics'),
    one('agent', 'Agent', choices?.agents ?? [], 'agentId', 'No agent is on this project'),
    ...(view.kind === 'TYPE' ? [] : [one('type', 'Type', choices?.types ?? [], 'typeId', 'This project has one type')]),
  ]
}
