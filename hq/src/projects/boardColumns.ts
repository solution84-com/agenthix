/**
 * A board's columns (adr-0097). Pure, so a module can read them without the
 * board service's imports. Backlog is no column: a task with no column is in
 * its board's Backlog, which every board has and which never starts work.
 */
import { HttpError } from 'wasp/server'
import type { BoardColumn } from '@agenthix/core'

export type TaskState = 'TODO' | 'IN_PROGRESS' | 'DONE'

/** Declared in core's client protocol, since the mobile app reads a board's columns too. */
export type { BoardColumn } from '@agenthix/core'

export type ColumnInput = {
  name: string
  label: string
  status: string
  description?: string
  hint?: string
  autoQueue?: boolean
}

/** Stored board data, not a component's style: the colour a column is shown with until a person picks one. */
const COLUMN_COLORS = ['#6B7280', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

/** A new board's columns when none are given, and Project Tasks' fixed ones: the task's own states. */
export const DEFAULT_BOARD_COLUMNS: BoardColumn[] = [
  { name: 'todo',        label: 'To do',       status: 'TODO',        order: 0, color: '#6B7280' },
  { name: 'in_progress', label: 'In progress', status: 'IN_PROGRESS', order: 1, color: '#3B82F6' },
  { name: 'done',        label: 'Done',        status: 'DONE',        order: 2, color: '#10B981' },
]

/** Every project's default board: never deleted, renamed or re-columned, and never starting work by itself. */
export const PROJECT_TASKS_NAME = 'Project Tasks'

/** Project Tasks as a nested create, for the paths that make a project in one write. */
export function projectTasksBoardCreate() {
  return { name: PROJECT_TASKS_NAME, kind: 'PROJECT_TASKS' as const, columns: DEFAULT_BOARD_COLUMNS as unknown as object[] }
}

const STATES = new Set<string>(['TODO', 'IN_PROGRESS', 'DONE'])

export function parseColumns(raw: unknown): BoardColumn[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? (parsed as BoardColumn[]) : []
  } catch {
    return []
  }
}

/** A board's stored columns as a client is given them: each declared field, and nothing else stored beside them. */
export function wireColumns(raw: unknown): BoardColumn[] {
  return parseColumns(raw).map(c => ({
    name: c.name, label: c.label, status: c.status, color: c.color, order: c.order,
    ...(c.description !== undefined ? { description: c.description } : {}),
    ...(c.hint !== undefined ? { hint: c.hint } : {}),
    ...(c.autoQueue !== undefined ? { autoQueue: c.autoQueue } : {}),
  }))
}

export function sortedColumns(columns: BoardColumn[]): BoardColumn[] {
  return [...columns].sort((a, b) => a.order - b.order)
}

export function findColumn(columns: BoardColumn[], name: string | null | undefined): BoardColumn | undefined {
  return name ? columns.find(c => c.name === name) : undefined
}

/** A column named loosely, as an agent may: its name in any case, or its state ("TODO"). */
export function resolveColumn(columns: BoardColumn[], wanted: string): BoardColumn | undefined {
  const w = wanted.toLowerCase()
  return sortedColumns(columns).find(c => c.name === wanted || c.name.toLowerCase() === w || c.status.toLowerCase() === w)
}

/** A task's state follows where it sits: its column's, or To do in the Backlog. */
export function stateOfPlace(columns: BoardColumn[], column: string | null): TaskState {
  return (findColumn(columns, column)?.status as TaskState | undefined) ?? 'TODO'
}

export function refuseBacklogColumn(columns: Array<{ name: string }>): void {
  if (columns.some(c => c.name.toLowerCase() === 'backlog')) {
    throw new HttpError(400, 'Every board has a Backlog already; name the column something else')
  }
}

/** The columns a board is made or edited with, numbered in the order given. */
export function columnsFromInput(input: ColumnInput[] | undefined): BoardColumn[] {
  if (!input || input.length === 0) return DEFAULT_BOARD_COLUMNS
  refuseBacklogColumn(input)
  return input.map((c, i) => {
    const status = c.status.toUpperCase()
    if (!STATES.has(status)) throw new HttpError(400, `"${c.status}" is not a state: a column is To do, In progress or Done`)
    return {
      name: c.name,
      label: c.label,
      status,
      order: i,
      color: COLUMN_COLORS[i % COLUMN_COLORS.length],
      description: c.description ?? '',
      hint: c.hint,
      autoQueue: c.autoQueue,
    }
  })
}
