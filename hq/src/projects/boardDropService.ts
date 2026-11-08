/**
 * Dropping a card on a board (adr-0176, spec B2, B3, D14; data model "How each board kind reads it"). A drop on a
 * type's column sets the task's column, so its state; on the task state board, its state (it lands on its type's
 * default column for it); on a field's option, that value only. Every drop but on the execution board, which is not
 * dragged, also sets the rank: on a filtered board a card goes after the visible card above it, or before the
 * visible card below it when it is dropped at the top. A drop starts nothing (D6). No auth, no HTTP: the operations
 * check who may (boardViewOperations.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { boardCard, boardRowOf, CARD_SELECT, type BoardCard } from './boardCardService'
import { notifyBoardsOfTasks } from './boardNotify'
import { columnKeyOf, dropChange, isOnBoard, matchesFilter, type BoardSpec, type BoardTaskRow } from './boardViewRules'
import { columnsOf, currentSprintId, fieldValuesOf, resolveBoard, type BoardRef } from './boardViewService'
import { writeFieldValue } from './fieldService'
import { recordTaskActivity, type TaskActor } from './taskActivity'
import { moveTask } from './taskColumnService'
import { lockProjectOrder, rankForMove } from './taskPlace'

export type BoardDrop = {
  taskId: string
  /** The column's key, as the board read gave it. */
  column: string
  /** The visible card above where it was dropped; or, dropped at the top, the visible card below. */
  afterTaskId?: string | null
  beforeTaskId?: string | null
}

export const NEIGHBOUR_MOVED =
  'The card it was dropped next to is no longer there on this board: someone moved it. Look again and drop it once more. Nothing was changed.'

async function rowOn(spec: BoardSpec, taskId: string): Promise<{ row: BoardTaskRow; projectId: string } | null> {
  const card = await prisma.task.findUnique({ where: { id: taskId }, select: { ...CARD_SELECT, projectId: true, archived: true } })
  if (!card || card.archived) return null
  const optionId = spec.kind === 'FIELD' ? ((await fieldValuesOf(spec.fieldId!, [taskId])).get(taskId) ?? null) : undefined
  return { row: boardRowOf(card, optionId), projectId: card.projectId }
}

export async function dropOnBoard(ref: BoardRef, drop: BoardDrop, actor: TaskActor = null): Promise<BoardCard> {
  if (drop.afterTaskId && drop.beforeTaskId) throw new HttpError(400, 'Name the card it goes after, or the one it goes before, not both. Nothing was changed.')
  const board = await resolveBoard(ref)
  const { spec } = board
  const task = await rowOn(spec, drop.taskId)
  if (!task || task.projectId !== board.projectId) throw new HttpError(404, 'Task not found')
  const { columns } = await columnsOf(spec)
  const change = dropChange(spec, columns, task.row, drop.column)
  if ('refused' in change) throw new HttpError(400, change.refused)

  const neighbourId = drop.afterTaskId || drop.beforeTaskId || null
  if (neighbourId) {
    const neighbour = await rowOn(spec, neighbourId)
    const sprintId = await currentSprintId(board.projectId)
    const visible = neighbour && neighbour.projectId === board.projectId && isOnBoard(spec, neighbour.row)
      && matchesFilter(spec.filter, neighbour.row, sprintId) && columnKeyOf(spec.kind, neighbour.row) === drop.column
    if (!visible) throw new HttpError(409, NEIGHBOUR_MOVED)
  }
  const place = drop.afterTaskId ? { afterTaskId: drop.afterTaskId } : drop.beforeTaskId ? { beforeTaskId: drop.beforeTaskId } : {}

  if (change.sets === 'field') {
    await dropOnField(board.projectId, drop.taskId, spec.fieldId!, change.optionId, place, actor)
  } else if (change.sets === 'column') {
    await moveTask(drop.taskId, { columnId: change.columnId, ...place }, actor)
  } else if (change.sets === 'state') {
    await moveTask(drop.taskId, { state: change.state, ...place }, actor)
  } else if (neighbourId) {
    await moveTask(drop.taskId, place, actor)
  }
  return boardCard(await prisma.task.findUniqueOrThrow({ where: { id: drop.taskId }, select: CARD_SELECT }))
}

/** The value and the rank in one transaction, under the project's order lock, so a drop lands whole or not at all. */
async function dropOnField(
  projectId: string, taskId: string, fieldId: string, optionId: string | null,
  place: { afterTaskId?: string; beforeTaskId?: string }, actor: TaskActor,
): Promise<void> {
  const reorders = !!(place.afterTaskId || place.beforeTaskId)
  const changed = await prisma.$transaction(async (tx) => {
    if (reorders) {
      await lockProjectOrder(tx, projectId)
      await tx.task.update({ where: { id: taskId }, data: { rank: await rankForMove(tx, projectId, taskId, place) } })
    }
    return writeFieldValue(tx, taskId, fieldId, optionId)
  })
  if (changed) await recordTaskActivity({ taskId, kind: 'EDITED', actor, detail: { fields: [`field:${fieldId}`] } })
  await notifyBoardsOfTasks([taskId])
  triggerSnapshotPush()
}
