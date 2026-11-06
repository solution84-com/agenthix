import type { ScheduleRuleInput } from '@agenthix/ui/tasks'

/** How often a new task starts again; "" starts it once (or not at all, without a start time). */
export type Repeat = '' | 'hourly' | 'daily' | 'weekly'

export const REPEAT_RULES: Record<Exclude<Repeat, ''>, { label: string; rule: ScheduleRuleInput }> = {
  hourly: { label: 'Every hour', rule: { kind: 'interval', every: 1, unit: 'hours' } },
  daily: { label: 'Every day', rule: { kind: 'interval', every: 1, unit: 'days' } },
  weekly: { label: 'Every week', rule: { kind: 'interval', every: 7, unit: 'days' } },
}

export interface NewTaskValues {
  title: string
  description: string
  agentId: string
  /** A picker value (`<providerId>/<model>`); '' follows the default. */
  modelChoice: string
  boardId: string
  /** A column's name; '' on no board, where the task is in the Backlog. */
  column: string
  /** undefined until the person chooses, so the project's only code workspace is the one it is made with. */
  workspaceId: string | null | undefined
  planStart: string
  planFinish: string
  /** A `datetime-local` value, or ''. */
  startsAt: string
  repeat: Repeat
  priority: string
  epicId: string
  files: File[]
}

export interface BoardChoice {
  id: string
  name: string
  columns: { name: string; label: string; status: string; order: number }[]
}

export interface NewTaskDefaults { epicId?: string; boardId?: string; column?: string }

/** The first To do column of a board: where a task made on it starts. */
export function firstTodoColumn(board: BoardChoice | undefined): string {
  const sorted = [...(board?.columns ?? [])].sort((a, b) => a.order - b.order)
  return (sorted.find(c => c.status === 'TODO') ?? sorted[0])?.name ?? ''
}

export function emptyNewTask(defaults: NewTaskDefaults = {}, boards: BoardChoice[] = []): NewTaskValues {
  const board = boards.find(b => b.id === defaults.boardId)
  const column = board ? (board.columns.some(c => c.name === defaults.column) ? defaults.column! : firstTodoColumn(board)) : ''
  return {
    title: '', description: '', agentId: '', modelChoice: '',
    boardId: board?.id ?? '', column, workspaceId: undefined,
    planStart: '', planFinish: '', startsAt: '', repeat: '', priority: 'MEDIUM',
    epicId: defaults.epicId ?? '', files: [],
  }
}

/** The model is chosen for an agent's runs, so it is offered only once an agent is. */
export const showsModel = (v: NewTaskValues): boolean => v.agentId !== ''

/** A column is a place on a board; a task on no board is in the Backlog, which has none. */
export const showsColumn = (v: NewTaskValues): boolean => v.boardId !== ''

/** Choosing another agent drops a model picked for the first; choosing no board drops the column. */
export function withChange(v: NewTaskValues, patch: Partial<NewTaskValues>, boards: BoardChoice[]): NewTaskValues {
  const next = { ...v, ...patch }
  if (patch.agentId !== undefined && patch.agentId !== v.agentId) next.modelChoice = ''
  if (patch.boardId !== undefined && patch.boardId !== v.boardId) {
    next.column = firstTodoColumn(boards.find(b => b.id === patch.boardId))
  }
  return next
}

export const canCreate = (v: NewTaskValues): boolean => v.title.trim() !== ''

/** What the next task starts from after *Create more*: a fresh form on the same board, with the same epic. */
export function freshAfterCreate(v: NewTaskValues, defaults: NewTaskDefaults, boards: BoardChoice[]): NewTaskValues {
  return emptyNewTask({ ...defaults, epicId: v.epicId || undefined, boardId: v.boardId || undefined, column: v.column || undefined }, boards)
}
