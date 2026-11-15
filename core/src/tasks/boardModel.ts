/**
 * A board is a saved view of the project's tasks in columns (adr-0176); it holds no task, state or sprint. Two kinds
 * are built in, the task state and the execution state; any other shows one type's columns or one custom field's
 * options, with an optional filter. Custom fields (single select only, for now) are extra views and never set the
 * task state. A sprint belongs to the project: one series, a task in at most one sprint.
 */
import type { BoardColour } from './taskModel.js'

export const BOARD_KINDS = ['TYPE', 'STATE', 'EXECUTION', 'FIELD'] as const
export type BoardKind = (typeof BOARD_KINDS)[number]

export function isBoardKind(value: unknown): value is BoardKind {
  return typeof value === 'string' && (BOARD_KINDS as readonly string[]).includes(value)
}

/**
 * What dropping a card on a board of each kind changes: a type's column (so its state, and its rank), the state
 * (the task lands on its type's default column for it), a field's value, or nothing (the execution board is not
 * dragged: Run, Stop and Answer are on the card). Reordering within a column changes the rank on every kind but
 * the execution board.
 */
export const BOARD_DROP_SETS: Readonly<Record<BoardKind, 'column' | 'state' | 'fieldValue' | null>> = {
  TYPE: 'column',
  STATE: 'state',
  EXECUTION: null,
  FIELD: 'fieldValue',
}

/**
 * A board's filter: the current sprint, one sprint or no sprint, an epic, an agent, and (on a board that spans types)
 * a type. Every part is optional.
 */
export type BoardFilter = {
  /** `none`: the tasks in no sprint. */
  sprint?: { current: true } | { sprintId: string } | { none: true }
  epicId?: string
  agentId?: string
  /** One type's tasks, on a board of the task state, the execution state or a field. */
  typeId?: string
}

/** A board as stored: `typeId` on a TYPE board, `fieldId` on a FIELD board, neither on the others. */
export type BoardDefinition = {
  id: string
  projectId: string
  name: string
  kind: BoardKind
  typeId: string | null
  fieldId: string | null
  filter: BoardFilter
  createdAt: Date
  updatedAt: Date
}

const ID_MAX_LENGTH = 64

function id(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= ID_MAX_LENGTH ? value : null
}

/**
 * A board's filter from stored or sent JSON: what is not a filter part is dropped, so a filter written by a later
 * version still reads.
 */
export function parseBoardFilter(raw: unknown): BoardFilter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: BoardFilter = {}
  const sprint = r.sprint
  if (sprint && typeof sprint === 'object' && !Array.isArray(sprint)) {
    const s = sprint as Record<string, unknown>
    if (s.current === true) out.sprint = { current: true }
    else if (s.none === true) out.sprint = { none: true }
    else if (id(s.sprintId)) out.sprint = { sprintId: s.sprintId as string }
  }
  if (id(r.epicId)) out.epicId = r.epicId as string
  if (id(r.agentId)) out.agentId = r.agentId as string
  if (id(r.typeId)) out.typeId = r.typeId as string
  return out
}

/** What is wrong with a board's kind and the type or field it names; empty when nothing is. */
export function boardDefinitionProblems(b: Pick<BoardDefinition, 'kind' | 'typeId' | 'fieldId'>): string[] {
  if (b.kind === 'TYPE') return b.typeId && !b.fieldId ? [] : ['A board of a type names that type, and no field.']
  if (b.kind === 'FIELD') return b.fieldId && !b.typeId ? [] : ['A board of a field names that field, and no type.']
  return b.typeId || b.fieldId ? ['The task state and execution boards name no type and no field.'] : []
}

// ── Custom fields ──

export const CUSTOM_FIELD_TYPES = ['SINGLE_SELECT'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const CUSTOM_FIELD_NAME_MAX_LENGTH = 40
export const FIELD_OPTION_NAME_MAX_LENGTH = 40
export const FIELD_OPTIONS_MAX = 30
export const PROJECT_CUSTOM_FIELDS_MAX = 30

export type FieldOptionFields = { id: string; fieldId: string; name: string; colour: BoardColour; order: number }

export type CustomFieldFields = {
  id: string
  projectId: string
  name: string
  type: CustomFieldType
  order: number
  madeFromVersionId: string | null
  archivedAt: Date | null
}

/** A field with its options, in their order. */
export type CustomFieldView = CustomFieldFields & { options: FieldOptionFields[] }

/** A task's value in one single-select field: one option, or no row at all. */
export type TaskFieldValue = { fieldId: string; optionId: string }

// ── Sprints ──

/** A numbered time box in the project's one series. It is finished only explicitly, and stays current, overdue, after its date. */
export type SprintFields = {
  id: string
  projectId: string
  /** Stays when the sprint is renamed. */
  number: number
  name: string | null
  startDate: Date
  finishDate: Date
  finishedAt: Date | null
}
