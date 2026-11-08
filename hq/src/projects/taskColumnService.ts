/**
 * Moving a task in the plan (adr-0174, spec D10, D14): to one of its type's columns, which writes its state with it;
 * to a state, landing on its type's default column for it; to another type, keeping its state; and to a place in
 * the project's one order. No auth, no HTTP: the operations check who may (taskPlaceOperations.ts).
 *
 * The whole move is one transaction under the project's order lock (taskPlace.ts), so of two moves at once the
 * second reads what the first wrote: the column and state always agree, and two drops into the same gap get two
 * ranks. A move starts nothing (D6); a move to Done takes the task out of its agent's line, as the work is decided.
 */
import { HttpError, prisma } from 'wasp/server'
import type { TaskState } from '@prisma/client'
import { recordActivity } from '../server/dashboard/activity'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { notifyBoardsOfTasks } from './boardNotify'
import { withdrawPendingRun } from './taskRunMoves'
import { recordTaskActivity, type TaskActor } from './taskActivity'
import { ensureBuiltInTaskTypes } from './taskTypes'
import {
  columnWithType, landingColumn, lockProjectOrder, placeData, rankForMove, RUNNING_TASK_NOT_EPIC, typeWithColumns, type OrderPlace,
} from './taskPlace'

export const EPIC_IN_EPIC = 'An epic cannot belong to an epic: take it out of its epic first. Nothing was changed.'
export const EPIC_WITH_TASKS =
  'This epic has tasks: move them out of it before it becomes another type. Nothing was changed.'

export type TaskMove = OrderPlace & {
  /** One of the task's type's columns, or of `typeId`'s when that is given too. */
  columnId?: string
  /** A task state: the type's default column for it. Not read when `columnId` is given. */
  state?: TaskState
  /** Another of the project's types: the task keeps its state there, unless a column or a state is given. */
  typeId?: string
}

export async function moveTask(taskId: string, move: TaskMove, actor: TaskActor = null) {
  const found = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (!found) throw new HttpError(404, 'Task not found')
  // Outside the transaction: making a missing built-in type may meet another caller's, which would abort it.
  const builtIn = move.typeId ? null : await ensureBuiltInTaskTypes(found.projectId)
  const outcome = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, number: true, typeId: true, columnId: true, state: true, doneAt: true, epicId: true, isEpic: true, runState: true, _count: { select: { epicTasks: true } } },
    })
    if (!task) throw new HttpError(404, 'Task not found')
    await lockProjectOrder(tx, task.projectId)

    const typeId = move.typeId ?? task.typeId ?? (task.isEpic ? builtIn!.EPIC : builtIn!.TASK)
    const type = await typeWithColumns(tx, typeId)
    if (!type || type.projectId !== task.projectId) throw new HttpError(400, "That task type is not one of this project's. Nothing was changed.")
    if (type.archivedAt && type.id !== task.typeId) throw new HttpError(400, 'That task type is archived: bring it back first. Nothing was changed.')
    if (type.kind === 'EPIC' && task.epicId) throw new HttpError(400, EPIC_IN_EPIC)
    if (type.kind !== 'EPIC' && task.isEpic && task._count.epicTasks > 0) throw new HttpError(400, EPIC_WITH_TASKS)
    if (type.kind === 'EPIC' && !task.isEpic && task.runState === 'RUN_ACTIVE') throw new HttpError(409, RUNNING_TASK_NOT_EPIC)

    let column = type.columns.find(c => c.id === task.columnId)
    if (move.columnId) {
      const named = await columnWithType(tx, move.columnId)
      if (!named || named.typeId !== type.id) throw new HttpError(400, "That column is not one of this task type's columns. Nothing was changed.")
      column = named
    } else if (move.state || !column) {
      column = landingColumn(type.columns, move.state ?? task.state)
    }

    const reorders = move.afterTaskId != null || move.beforeTaskId != null
    const rank = reorders ? await rankForMove(tx, task.projectId, task.id, move) : undefined
    const updated = await tx.task.update({
      where: { id: task.id },
      data: { ...placeData(column, type.kind, task), ...(rank ? { rank } : {}) },
    })
    return { before: task, updated }
  })

  const { before, updated } = outcome
  const moved = before.columnId !== updated.columnId
  if (moved) {
    await recordTaskActivity({ taskId, kind: 'MOVED', actor, detail: { fromColumnId: before.columnId, toColumnId: updated.columnId } })
  }
  // An epic is never run, and Done work is decided: either leaves its agent's line.
  if (updated.isEpic && !before.isEpic) await withdrawPendingRun(taskId)
  if (updated.state === 'DONE' && before.state !== 'DONE') {
    await withdrawPendingRun(taskId)
    await recordTaskClosed(updated)
  }
  await notifyBoardsOfTasks([taskId])
  triggerSnapshotPush()
  return prisma.task.findUniqueOrThrow({ where: { id: taskId } })
}

/** Setting a task's state directly: it lands on its type's default column for that state. */
export function setTaskState(taskId: string, state: TaskState, actor: TaskActor = null) {
  return moveTask(taskId, { state }, actor)
}

async function recordTaskClosed(task: { id: string; projectId: string; number: number }): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { key: true } })
  recordActivity('task_closed', `${project?.key ?? 'Task'}-${task.number} closed`, task.id, task.projectId)
}
