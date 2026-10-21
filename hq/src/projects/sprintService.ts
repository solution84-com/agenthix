/**
 * A sprint board's sprints (adr-0097). The current sprint is the one not
 * finished; a sprint board's columns show it, and its Backlog holds the tasks
 * in no sprint. Finishing it records its done tasks in it, starts the next with
 * the same length, and sends its unfinished tasks where whoever finishes it
 * says — there is no default.
 */
import { prisma, HttpError } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { nextSprintDates } from './sprintDates'
import { withdrawPendingRun } from './taskRunMoves'

export type UnfinishedDestination = 'next' | 'backlog'
const DESTINATIONS: readonly string[] = ['next', 'backlog']

type Db = Pick<Prisma.TransactionClient, 'sprint'>

/** The sprint a sprint board's columns show now; null for any other board. */
export async function currentSprint(boardId: string, db: Db = prisma) {
  return db.sprint.findFirst({ where: { boardId, finishedAt: null }, orderBy: { number: 'desc' } })
}

/**
 * The sprint a task gets when it lands in a column of `boardId`: the current
 * one on a sprint board, none on any other and none in the Backlog.
 */
export async function sprintForPlace(boardId: string, column: string | null): Promise<string | null> {
  if (column === null) return null
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { kind: true } })
  if (board?.kind !== 'SPRINTS') return null
  return (await currentSprint(boardId))?.id ?? null
}

export async function listSprints(boardId: string) {
  const sprints = await prisma.sprint.findMany({
    where: { boardId },
    orderBy: { number: 'desc' },
    include: { _count: { select: { tasks: true } } },
  })
  const done = await prisma.task.groupBy({
    by: ['sprintId'],
    where: { sprintId: { in: sprints.map(s => s.id) }, status: 'DONE' },
    _count: { _all: true },
  })
  const doneBy = new Map(done.map(d => [d.sprintId, d._count._all]))
  return sprints.map(({ _count, ...s }) => ({ ...s, taskCount: _count.tasks, doneCount: doneBy.get(s.id) ?? 0 }))
}

export async function renameSprint(sprintId: string, name: string | null) {
  const trimmed = name?.trim() || null
  if (trimmed && trimmed.length > 120) throw new HttpError(400, "A sprint's name is at most 120 characters")
  return prisma.sprint.update({ where: { id: sprintId }, data: { name: trimmed } })
}

export function requireDestination(value: unknown): UnfinishedDestination {
  if (typeof value !== 'string' || !DESTINATIONS.includes(value)) {
    throw new HttpError(400, 'Say where the unfinished tasks go: "next" (the next sprint) or "backlog"')
  }
  return value as UnfinishedDestination
}

/**
 * Finishes the board's current sprint. Its done tasks stay recorded in it; the
 * rest move to the next sprint (same columns) or to the Backlog (no column, no
 * sprint, nothing pending started). Claimed by compare-and-set on the sprint's
 * `finishedAt`, so two finishes at once finish it once.
 */
export async function finishSprint(boardId: string, unfinished: UnfinishedDestination, now = new Date()) {
  requireDestination(unfinished)
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { kind: true, archivedAt: true } })
  if (!board) throw new HttpError(404, 'Board not found')
  if (board.kind !== 'SPRINTS') throw new HttpError(400, 'Only a sprint board has sprints to finish')
  if (board.archivedAt) throw new HttpError(400, 'That board is archived')
  const sprint = await currentSprint(boardId)
  if (!sprint) throw new HttpError(409, 'This board has no sprint in progress')

  const moved = await prisma.task.findMany({ where: { sprintId: sprint.id, status: { not: 'DONE' } }, select: { id: true } })
  const result = await prisma.$transaction(async tx => {
    const { count } = await tx.sprint.updateMany({ where: { id: sprint.id, finishedAt: null }, data: { finishedAt: now } })
    if (count === 0) throw new HttpError(409, 'That sprint was finished already')
    const next = await tx.sprint.create({ data: { boardId, number: sprint.number + 1, ...nextSprintDates(sprint, now) } })
    const ids = moved.map(t => t.id)
    if (unfinished === 'next') {
      await tx.task.updateMany({ where: { id: { in: ids } }, data: { sprintId: next.id } })
    } else {
      await tx.task.updateMany({ where: { id: { in: ids } }, data: { sprintId: null, column: null, status: 'TODO', doneAt: null } })
    }
    return { finished: { ...sprint, finishedAt: now }, next, movedTaskIds: ids, unfinished }
  })
  if (unfinished === 'backlog') for (const t of moved) await withdrawPendingRun(t.id)
  const { emitTaskUpdated } = await import('../server/socket')
  emitTaskUpdated(boardId)
  triggerSnapshotPush()
  return result
}
