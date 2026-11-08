/**
 * The task model (adr-0174): a project's task types, each with its own columns; each column sits in one of the four
 * built-in task states, so a task's state is the state of its column. A task also has one rank, project-wide
 * (./rank.ts), at most one sprint, and a value in any of the project's custom fields (./boardModel.ts), which never
 * set its state. What an agent is doing with a task is its execution state (./executionState.ts), set only by the
 * system.
 *
 * Dates are `Date`, as superjson carries them to a client.
 */

/** Backlog · To do · In progress · Done: the same four in every project. A new task starts in Backlog. */
export const TASK_STATES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'] as const
export type TaskState = (typeof TASK_STATES)[number]

export const TASK_STATE_LABELS: Readonly<Record<TaskState, string>> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && (TASK_STATES as readonly string[]).includes(value)
}

/**
 * Task and Epic exist in every project and cannot be deleted; any other type is the project's own. An epic groups
 * tasks toward one goal and is never run, though an agent may manage it.
 */
export const TASK_TYPE_KINDS = ['TASK', 'EPIC', 'CUSTOM'] as const
export type TaskTypeKind = (typeof TASK_TYPE_KINDS)[number]

/**
 * The colours a column or a field's option may have, as names the screens map to design tokens: a stored value is
 * never a hex code. A value this side does not know is drawn as `neutral`.
 */
export const BOARD_COLOURS = ['neutral', 'accent', 'success', 'warning', 'danger'] as const
export type BoardColour = (typeof BOARD_COLOURS)[number]

export function isBoardColour(value: unknown): value is BoardColour {
  return typeof value === 'string' && (BOARD_COLOURS as readonly string[]).includes(value)
}

export const TASK_TYPE_NAME_MAX_LENGTH = 40
export const COLUMN_NAME_MAX_LENGTH = 40
/** The most columns one type may have, and the most types one project may define. */
export const TYPE_COLUMNS_MAX = 20
export const PROJECT_TASK_TYPES_MAX = 30

/** One of a type's own columns. Each state has at least one column, and exactly one is its default. */
export type TypeColumnFields = {
  id: string
  typeId: string
  name: string
  colour: BoardColour
  order: number
  state: TaskState
  /** Where a task of this type lands when its state is set directly, or it is added to a sprint from Backlog. */
  defaultForState: boolean
}

export type TaskTypeFields = {
  id: string
  projectId: string
  name: string
  /** An icon's name from the screens' icon set; one this side does not know is drawn as the task icon. */
  icon: string
  kind: TaskTypeKind
  /** The Library task template version it came from; null when made in the project. Read-only, never followed. */
  madeFromVersionId: string | null
  /** Set while archived; never on Task or Epic. A type with open tasks is not archived. */
  archivedAt: Date | null
}

/** A type with its columns, in their order. */
export type TaskTypeView = TaskTypeFields & { columns: TypeColumnFields[] }

/** A type where a task names it. */
export type TaskTypeRef = { id: string; name: string; icon: string; kind: TaskTypeKind }

/** A column where a task names it: a screen shows its name only, never the state beside it. */
export type TypeColumnRef = { id: string; name: string; colour: BoardColour; state: TaskState }

/**
 * A task's place in the plan: its type, its column (so its state, written with it), its rank, its sprint and its
 * epic. `scheduleAt` is a person's Run at…: the time it is started.
 */
export type TaskPlanFields = {
  typeId: string
  columnId: string
  state: TaskState
  rank: string
  sprintId: string | null
  /** A task of type Epic; an epic belongs to no epic. */
  epicId: string | null
  scheduleAt: Date | null
}

/** A column as a type is defined with it, before it is stored: in a new project, a template, or a new type. */
export type TypeColumnDefinition = { name: string; colour: BoardColour; state: TaskState; defaultForState: boolean }

/**
 * What is wrong with a type's columns, in words a person reads; empty when nothing is. Every state has at least one
 * column, exactly one of them its default; names are unique within the type, ignoring case.
 */
export function typeColumnProblems(columns: readonly TypeColumnDefinition[]): string[] {
  const problems: string[] = []
  if (columns.length > TYPE_COLUMNS_MAX) problems.push(`A type has at most ${TYPE_COLUMNS_MAX} columns.`)
  const seen = new Set<string>()
  for (const c of columns) {
    const name = c.name.trim()
    if (name === '' || name.length > COLUMN_NAME_MAX_LENGTH) {
      problems.push(`A column's name is 1 to ${COLUMN_NAME_MAX_LENGTH} characters.`)
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) problems.push(`Two columns are named "${name}".`)
    seen.add(key)
  }
  for (const state of TASK_STATES) {
    const inState = columns.filter(c => c.state === state)
    const label = TASK_STATE_LABELS[state]
    if (inState.length === 0) problems.push(`${label} needs at least one column.`)
    else if (inState.filter(c => c.defaultForState).length !== 1) problems.push(`${label} needs exactly one default column.`)
  }
  return problems
}

/**
 * The column a task of this type lands on when its state is set to `state`: setting the state directly, dropping it
 * on the Task state board, or changing its type (which keeps its state). Null only for columns that fail
 * `typeColumnProblems`.
 */
export function defaultColumnFor<C extends { state: TaskState; defaultForState: boolean; order: number }>(
  columns: readonly C[], state: TaskState,
): C | null {
  const inState = columns.filter(c => c.state === state).sort((a, b) => a.order - b.order)
  return inState.find(c => c.defaultForState) ?? inState[0] ?? null
}

/** Adding a task to a sprint commits to it: a Backlog task moves to To do (N1); any other state is kept. */
export function stateOnSprintAdd(state: TaskState): TaskState {
  return state === 'BACKLOG' ? 'TODO' : state
}

/** A task counted as open: not Done. An archived task is counted by whoever reads it, not here. */
export function isOpenState(state: TaskState): boolean {
  return state !== 'DONE'
}
