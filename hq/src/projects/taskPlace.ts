/**
 * Where a task is in the plan (adr-0174): its type, one of the type's columns, and the state that column sits in,
 * always written together; and its rank, its place in the project's one order (core's rank: compared as text).
 *
 * Rank writes take the project's order lock first, so two tasks created or moved into the same gap at once get two
 * different ranks, one after the other.
 *
 * While the board that owned a task is still read (it goes with the phase that replaces boards), a write here also
 * keeps the deprecated `status`, `isEpic` and the old Backlog (`column` null) in step, and the old board paths below
 * write the new place from theirs.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma, TaskState } from '@prisma/client'
import { defaultColumnFor, rankBetween, type TaskTypeKind } from '@agenthix/core'
import { ensureBuiltInTaskTypes } from './taskTypes'

type Tx = Prisma.TransactionClient

export type PlaceColumn = { id: string; typeId: string; state: TaskState; defaultForState: boolean; order: number }

const COLUMN_SELECT = { id: true, typeId: true, state: true, defaultForState: true, order: true } as const

/** Holds the project's order until the transaction ends. */
export async function lockProjectOrder(tx: Tx, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('task-rank'), hashtext(${projectId}))`
}

/** A rank after every ranked task of the project. Call under the order lock. */
export async function rankAtEnd(tx: Tx, projectId: string, exceptTaskId?: string): Promise<string> {
  const last = await tx.task.findFirst({
    where: { projectId, rank: { not: null }, ...(exceptTaskId ? { id: { not: exceptTaskId } } : {}) },
    orderBy: { rank: 'desc' },
    select: { rank: true },
  })
  return rankBetween(last?.rank ?? null, null)
}

/** Gives a rank, at the end and in their numbers' order, to the project's tasks that have none. Under the order lock. */
async function rankUnranked(tx: Tx, projectId: string): Promise<void> {
  const unranked = await tx.task.findMany({ where: { projectId, rank: null }, orderBy: { number: 'asc' }, select: { id: true } })
  if (unranked.length === 0) return
  let rank = await rankAtEnd(tx, projectId)
  for (const t of unranked) {
    await tx.task.update({ where: { id: t.id }, data: { rank } })
    rank = rankBetween(rank, null)
  }
}

export type OrderPlace = { afterTaskId?: string | null; beforeTaskId?: string | null }

/**
 * The rank that puts `taskId` right after `afterTaskId`, or right before `beforeTaskId`; with neither, last. The
 * other task must be another of the same project. Under the order lock.
 */
export async function rankForMove(tx: Tx, projectId: string, taskId: string, place: OrderPlace): Promise<string> {
  const neighbourId = place.afterTaskId ?? place.beforeTaskId ?? null
  if (!neighbourId) return rankAtEnd(tx, projectId, taskId)
  if (neighbourId === taskId) throw new HttpError(400, 'A task cannot be placed next to itself. Nothing was changed.')
  await rankUnranked(tx, projectId)
  const neighbour = await tx.task.findUnique({ where: { id: neighbourId }, select: { projectId: true, rank: true } })
  if (!neighbour || neighbour.projectId !== projectId || !neighbour.rank) {
    throw new HttpError(400, 'The task to place it next to is not in this project. Nothing was changed.')
  }
  const others = { projectId, id: { not: taskId }, rank: { not: null } }
  if (place.afterTaskId) {
    const next = await tx.task.findFirst({ where: { ...others, rank: { gt: neighbour.rank } }, orderBy: { rank: 'asc' }, select: { rank: true } })
    return rankBetween(neighbour.rank, next?.rank ?? null)
  }
  const prev = await tx.task.findFirst({ where: { ...others, rank: { lt: neighbour.rank } }, orderBy: { rank: 'desc' }, select: { rank: true } })
  return rankBetween(prev?.rank ?? null, neighbour.rank)
}

/** The fields a task's place writes: its type, its column, the column's state, and the deprecated fields that follow. */
export function placeData(column: PlaceColumn, typeKind: TaskTypeKind, current?: { state: TaskState; doneAt: Date | null }) {
  const done = column.state === 'DONE'
  return {
    typeId: column.typeId,
    columnId: column.id,
    state: column.state,
    // Deprecated mirrors, read by the board screens and the old paths until they go.
    status: column.state === 'BACKLOG' ? ('TODO' as const) : column.state,
    isEpic: typeKind === 'EPIC',
    // Only an epic has a milestone.
    ...(typeKind === 'EPIC' ? {} : { milestoneId: null }),
    // Moving between Done columns keeps the time it first finished.
    doneAt: done ? (current?.state === 'DONE' && current.doneAt ? current.doneAt : new Date()) : null,
    ...(done ? { archived: false } : {}),
  }
}

export async function typeWithColumns(db: Tx | typeof prisma, typeId: string) {
  return db.taskType.findUnique({
    where: { id: typeId },
    select: { id: true, projectId: true, kind: true, name: true, archivedAt: true, columns: { select: COLUMN_SELECT, orderBy: { order: 'asc' } } },
  })
}

export async function columnWithType(db: Tx | typeof prisma, columnId: string) {
  return db.typeColumn.findUnique({ where: { id: columnId }, select: { ...COLUMN_SELECT, type: { select: { id: true, projectId: true, kind: true, archivedAt: true } } } })
}

/** The type's column a task lands on for `state`. */
export function landingColumn<C extends PlaceColumn>(columns: readonly C[], state: TaskState): C {
  const column = defaultColumnFor(columns, state)
  // Every type keeps a column in every state (taskTypeService.ts), so this is a fault to see, not a refusal.
  if (!column) throw new Error(`task type has no column for ${state}`)
  return column
}

/**
 * The column a new task starts in: the one named (of the named type, or of its own type when no type is named), else
 * the type's default column for the state named, else its Backlog. The type defaults to the project's Task, or Epic
 * for an epic made by the deprecated flag.
 */
export async function resolveNewTaskPlace(projectId: string, given: {
  typeId?: string | null
  columnId?: string | null
  state?: TaskState | null
  isEpic?: boolean
}): Promise<{ column: PlaceColumn; kind: TaskTypeKind }> {
  if (given.columnId) {
    const column = await columnWithType(prisma, given.columnId)
    if (!column || column.type.projectId !== projectId || (given.typeId && column.typeId !== given.typeId)) {
      throw new HttpError(400, "That column is not one of this task type's columns. Nothing was changed.")
    }
    if (column.type.archivedAt) throw new HttpError(400, 'That task type is archived: bring it back first. Nothing was changed.')
    return { column, kind: column.type.kind }
  }
  const builtIn = given.typeId ? null : await ensureBuiltInTaskTypes(projectId)
  const typeId = given.typeId ?? (given.isEpic ? builtIn!.EPIC : builtIn!.TASK)
  const type = await typeWithColumns(prisma, typeId)
  if (!type || type.projectId !== projectId) throw new HttpError(400, 'That task type is not one of this project\'s. Nothing was changed.')
  if (type.archivedAt) throw new HttpError(400, 'That task type is archived: bring it back first. Nothing was changed.')
  return { column: landingColumn(type.columns, given.state ?? 'BACKLOG'), kind: type.kind }
}

/** The new task state a deprecated board place stands for: its Backlog is Backlog, a column its column's state. */
export function stateOfBoardPlace(column: string | null, status: 'TODO' | 'IN_PROGRESS' | 'DONE'): TaskState {
  return column === null ? 'BACKLOG' : status
}

/**
 * The new place written beside a deprecated board move: the task's own type (Task, or Epic for an epic, when it has
 * none yet), on that type's default column for the state the board place stands for.
 */
export async function placeForBoardMove(taskId: string, state: TaskState) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, typeId: true, isEpic: true } })
  if (!task) return {}
  const builtIn = task.typeId ? null : await ensureBuiltInTaskTypes(task.projectId)
  const type = await typeWithColumns(prisma, task.typeId ?? (task.isEpic ? builtIn!.EPIC : builtIn!.TASK))
  if (!type) return {}
  const column = landingColumn(type.columns, state)
  return { typeId: type.id, columnId: column.id, state: column.state }
}

/** The place on the project's Task or Epic type for `state`: where the deprecated epic flag puts a task. */
export async function placeForBuiltInType(projectId: string, kind: 'TASK' | 'EPIC', state: TaskState) {
  const builtIn = await ensureBuiltInTaskTypes(projectId)
  const type = await typeWithColumns(prisma, builtIn[kind])
  if (!type) throw new Error(`project ${projectId} has no ${kind} type`)
  const column = landingColumn(type.columns, state)
  return { typeId: type.id, columnId: column.id, state: column.state }
}

export const RUNNING_TASK_NOT_EPIC = 'This task is running: stop it before it becomes an epic, which is never run. Nothing was changed.'
