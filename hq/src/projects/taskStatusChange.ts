import { prisma, HttpError } from 'wasp/server'
import type { BoardColumn } from '@agenthix/core'
import type { TaskState } from './boardColumns'
import { parseColumns, sortedColumns } from './boardColumns'
import { ensureProjectTasks } from './boardService'

/**
 * Where a task goes when an edit names a state. A state is where a task sits, not a field: closing is a move
 * (taskStateService.ts), so the edit is carried out as a move into the board's first column of that state, or its
 * Backlog for To do when it has no such column. A board with no column of that state is told so.
 */
export function placeForState(columns: BoardColumn[], status: TaskState): { column: string | null } {
  const wanted = sortedColumns(columns).find(c => c.status === status)
  if (wanted) return { column: wanted.name }
  if (status === 'TODO') return { column: null }
  throw new HttpError(400, `This task's board has no column for ${status}; move the task to a column instead`)
}

/** The move an edit's state needs, or null when the task is in that state already. */
export async function moveForStatusEdit(taskId: string, status: TaskState): Promise<{ column: string | null } | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true, boardId: true, projectId: true } })
  if (!task) throw new HttpError(404, 'Task not found')
  if (task.status === status) return null
  const board = await prisma.board.findUnique({ where: { id: task.boardId ?? await ensureProjectTasks(task.projectId) }, select: { columns: true } })
  return placeForState(parseColumns(board?.columns), status)
}
