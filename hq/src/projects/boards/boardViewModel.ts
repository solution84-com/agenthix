/**
 * The board screen's view in words and in the address (adr-0176, the board design): what a board is a view of, the
 * view as changed on screen and not yet saved, and how each is said ("Bug's columns · Sprint: current"). Pure, so the
 * screens and their tests read one set of rules.
 */
import { TASK_STATE_LABELS, TASK_STATES, type BoardFilter, type BoardKind, type TaskTypeView } from '@agenthix/core'
import type { BoardChoices } from '../boardChoices'

export type ViewSpec = { kind: BoardKind; typeId: string | null; fieldId: string | null; filter: BoardFilter }

/** What the address may change on a board before it is saved: its columns, and each part of its filter ('any' clears one). */
export type ViewOverrides = {
  cols?: string
  sprint?: string
  epic?: string
  agent?: string
  type?: string
}

export const OVERRIDE_PARAMS = { cols: 'bcols', sprint: 'bsprint', epic: 'bepic', agent: 'bagent', type: 'btype' } as const

export const BUILT_IN_SPECS: Record<'state' | 'execution', ViewSpec> = {
  state: { kind: 'STATE', typeId: null, fieldId: null, filter: {} },
  execution: { kind: 'EXECUTION', typeId: null, fieldId: null, filter: {} },
}

/** "state", "execution", "type:<id>", "field:<id>": a board's columns as the address names them. */
export function colsOf(spec: Pick<ViewSpec, 'kind' | 'typeId' | 'fieldId'>): string {
  if (spec.kind === 'TYPE') return `type:${spec.typeId}`
  if (spec.kind === 'FIELD') return `field:${spec.fieldId}`
  return spec.kind === 'STATE' ? 'state' : 'execution'
}

function specOfCols(cols: string): Pick<ViewSpec, 'kind' | 'typeId' | 'fieldId'> | null {
  if (cols === 'state') return { kind: 'STATE', typeId: null, fieldId: null }
  if (cols === 'execution') return { kind: 'EXECUTION', typeId: null, fieldId: null }
  const [kind, id] = cols.split(':')
  if (!id) return null
  if (kind === 'type') return { kind: 'TYPE', typeId: id, fieldId: null }
  if (kind === 'field') return { kind: 'FIELD', typeId: null, fieldId: id }
  return null
}

function sprintPart(value: string): BoardFilter['sprint'] | undefined {
  if (value === 'any') return undefined
  if (value === 'current') return { current: true }
  if (value === 'none') return { none: true }
  return { sprintId: value }
}

export function sprintValue(sprint: BoardFilter['sprint']): string {
  if (!sprint) return 'any'
  if ('current' in sprint) return 'current'
  if ('none' in sprint) return 'none'
  return sprint.sprintId
}

/** The view shown: what was saved (or the built-in board), with what the address changes. A type board has no Type filter. */
export function applyOverrides(base: ViewSpec, o: ViewOverrides): ViewSpec {
  const cols = o.cols ? specOfCols(o.cols) : null
  const filter: BoardFilter = { ...base.filter }
  if (o.sprint !== undefined) { const s = sprintPart(o.sprint); if (s) filter.sprint = s; else delete filter.sprint }
  if (o.epic !== undefined) { if (o.epic === 'any') delete filter.epicId; else filter.epicId = o.epic }
  if (o.agent !== undefined) { if (o.agent === 'any') delete filter.agentId; else filter.agentId = o.agent }
  if (o.type !== undefined) { if (o.type === 'any') delete filter.typeId; else filter.typeId = o.type }
  const shape = cols ?? base
  if (shape.kind === 'TYPE') delete filter.typeId
  return { kind: shape.kind, typeId: shape.typeId, fieldId: shape.fieldId, filter }
}

const sameFilter = (a: BoardFilter, b: BoardFilter) =>
  sprintValue(a.sprint) === sprintValue(b.sprint) && (a.epicId ?? null) === (b.epicId ?? null)
  && (a.agentId ?? null) === (b.agentId ?? null) && (a.typeId ?? null) === (b.typeId ?? null)

export function sameColumns(a: ViewSpec, b: ViewSpec): boolean {
  return colsOf(a) === colsOf(b)
}

export function isChanged(base: ViewSpec, view: ViewSpec): boolean {
  return !sameColumns(base, view) || !sameFilter(base.filter, view.filter)
}

/** The overrides that turn `base` into `view`; empty when they are the same. */
export function overridesFor(base: ViewSpec, view: ViewSpec): ViewOverrides {
  const o: ViewOverrides = {}
  if (!sameColumns(base, view)) o.cols = colsOf(view)
  if (sprintValue(base.filter.sprint) !== sprintValue(view.filter.sprint)) o.sprint = sprintValue(view.filter.sprint)
  if ((base.filter.epicId ?? null) !== (view.filter.epicId ?? null)) o.epic = view.filter.epicId ?? 'any'
  if ((base.filter.agentId ?? null) !== (view.filter.agentId ?? null)) o.agent = view.filter.agentId ?? 'any'
  if ((base.filter.typeId ?? null) !== (view.filter.typeId ?? null)) o.type = view.filter.typeId ?? 'any'
  return o
}

// ── Words ──

const STATE_NAMES = TASK_STATES.map(s => TASK_STATE_LABELS[s])

/** Whether a type's columns are the four states as they are: such a type is not listed in Columns. */
export function columnsAreTheStates(type: TaskTypeView): boolean {
  return type.columns.length === STATE_NAMES.length && type.columns.every((c, i) => c.name === STATE_NAMES[i] && c.state === TASK_STATES[i])
}

/** "Bug's columns", "Task state", "Launch stage", "Execution state". */
export function columnsLabel(spec: ViewSpec, choices: BoardChoices | undefined): string {
  if (spec.kind === 'STATE') return 'Task state'
  if (spec.kind === 'EXECUTION') return 'Execution state'
  if (spec.kind === 'TYPE') return `${choices?.types.find(t => t.id === spec.typeId)?.name ?? 'A type'}'s columns`
  return choices?.fields.find(f => f.id === spec.fieldId)?.name ?? 'A field'
}

/** A sprint's name as its filter says it: "Current sprint", "Sprint 5", "Not in a sprint". */
export function sprintText(sprint: BoardFilter['sprint'], choices: BoardChoices | undefined): string | null {
  if (!sprint) return null
  if ('current' in sprint) return 'Current sprint'
  if ('none' in sprint) return 'Not in a sprint'
  const all = choices ? [choices.sprints.current, ...choices.sprints.upcoming, ...choices.sprints.past] : []
  return all.find(s => s?.id === sprint.sprintId)?.name ?? 'A sprint no longer in the series'
}

export type FilterTexts = { sprint: string | null; epic: string | null; agent: string | null; type: string | null }

export function filterTexts(filter: BoardFilter, choices: BoardChoices | undefined): FilterTexts {
  const name = (list: { id: string; name: string }[] | undefined, id: string | undefined, gone: string) =>
    id ? list?.find(x => x.id === id)?.name ?? gone : null
  return {
    sprint: sprintText(filter.sprint, choices),
    epic: name(choices?.epics, filter.epicId, 'A removed epic'),
    agent: name(choices?.agents, filter.agentId, 'An agent no longer here'),
    type: name(choices?.types, filter.typeId, 'An archived type'),
  }
}

/** "Sprint: current · Epic: Launch pages": the filter in the order the toolbar draws it. */
export function filterWords(filter: BoardFilter, choices: BoardChoices | undefined): string[] {
  const t = filterTexts(filter, choices)
  const sprint = filter.sprint && 'current' in filter.sprint ? 'current' : filter.sprint && 'none' in filter.sprint ? 'none' : t.sprint
  return [
    sprint && `Sprint: ${sprint}`, t.epic && `Epic: ${t.epic}`, t.agent && `Agent: ${t.agent}`, t.type && `Type: ${t.type}`,
  ].filter((w): w is string => !!w)
}

/** What a board shows, in its row on a list of boards: "Bug's columns · Sprint: current", "every type, by task state". */
export function boardWhat(spec: ViewSpec, names: { typeName: string | null; fieldName: string | null }, choices?: BoardChoices): string {
  const what = spec.kind === 'STATE' ? 'every type, by task state'
    : spec.kind === 'EXECUTION' ? 'by what each run is doing'
      : spec.kind === 'TYPE' ? `${names.typeName ?? 'A type'}'s columns`
        : `${names.fieldName ?? 'A field'} · a field`
  return [what, ...filterWords(spec.filter, choices)].join(' · ')
}

/** The line under the board's name: what it shows, its filter, and how many of its tasks are shown. */
export function countsLine(spec: ViewSpec, choices: BoardChoices | undefined, counts: { total: number; shown: number }, saved: boolean): string {
  const filters = filterWords(spec.filter, choices)
  const what = spec.kind === 'STATE' ? 'Every task of every type, by its task state'
    : spec.kind === 'EXECUTION' ? 'Every task, by what its latest run is doing · the system moves these cards'
      : spec.kind === 'TYPE' ? columnsLabel(spec, choices)
        : `${columnsLabel(spec, choices)} · every type`
  const tasks = counts.shown === counts.total ? `${counts.total} ${counts.total === 1 ? 'task' : 'tasks'}` : `${counts.shown} of ${counts.total} tasks shown`
  const everything = spec.kind === 'TYPE' && filters.length === 0 ? ['every sprint, epic and agent'] : []
  return [...(saved ? [] : ['Not saved yet']), what, ...everything, ...filters, ...(saved ? [tasks] : [])].join(' · ')
}
