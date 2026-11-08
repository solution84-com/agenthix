/**
 * The client protocol's deprecated board fields and arguments (since 1.16; they stop working in 3.0), read now that a
 * task is on no board (adr-0176). Nothing here is stored: each is worked out from the task model.
 *
 * - A task's `boardId` is its project's id, which names the project's built-in Task state board: `getBoard` opens
 *   it, and its socket room says when the project's tasks change.
 * - A task's `column` is the old default column its state stands for (`todo`, `in_progress`, `done`), or null in
 *   Backlog, as the old Backlog was.
 * - A `column` argument names a task state, by the old names or the state itself; a `boardId` argument moves nothing.
 */
import type { TaskState } from '@prisma/client'

const COLUMN_OF_STATE: Record<TaskState, string | null> = { BACKLOG: null, TODO: 'todo', IN_PROGRESS: 'in_progress', DONE: 'done' }

const STATE_OF_COLUMN: Record<string, TaskState> = {
  backlog: 'BACKLOG', todo: 'TODO', to_do: 'TODO', 'to do': 'TODO', in_progress: 'IN_PROGRESS', 'in progress': 'IN_PROGRESS', done: 'DONE',
}

export const columnOfState = (state: TaskState): string | null => COLUMN_OF_STATE[state]

/** The task state a deprecated column argument stands for: null is Backlog; a name it does not know, undefined. */
export function stateOfColumnArg(column: string | null | undefined): TaskState | undefined {
  if (column === null || column === undefined) return 'BACKLOG'
  return STATE_OF_COLUMN[column.trim().toLowerCase()]
}

export const UNKNOWN_COLUMN =
  'A task is on no board now: name a column of its type with columnId, or a state (Backlog, To do, In progress or Done). Nothing was changed.'
