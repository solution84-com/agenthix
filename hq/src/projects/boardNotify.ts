/**
 * Tells the browsers watching a board that a task's run state changed (the
 * `taskUpdated` socket event the board page refreshes on). Every write of a
 * task's run state calls one of these after it, so a board never shows a state
 * that has already moved on, and the round line — which `getBoard` computes
 * from the same rows — follows. A notification never fails the write it
 * follows.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BoardNotify')

async function emitToBoards(boardIds: Iterable<string | null | undefined>): Promise<void> {
  const ids = [...new Set([...boardIds].filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const { emitTaskUpdated } = await import('../server/socket')
  for (const id of ids) emitTaskUpdated(id)
}

async function safely(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    logger.warn(`could not notify boards after ${what}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The boards these tasks are on, each told once. */
export function notifyBoardsOfTasks(taskIds: string[]): Promise<void> {
  return safely('a run state change', async () => {
    if (taskIds.length === 0) return
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { boardId: true } })
    await emitToBoards(tasks.map(t => t.boardId))
  })
}

/** The boards of the tasks `where` selects, read before a bulk write changes what it selects. */
export async function boardsOfTasksWhere(where: Prisma.TaskWhereInput): Promise<string[]> {
  try {
    const tasks = await prisma.task.findMany({ where, select: { boardId: true }, distinct: ['boardId'] })
    return tasks.map(t => t.boardId)
  } catch (err) {
    logger.warn(`could not read the boards to notify: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

export function notifyBoards(boardIds: string[]): Promise<void> {
  return safely('a run state change', () => emitToBoards(boardIds))
}

/** Every board of a project: a round opening or closing changes the line each shows, whichever tasks it holds. */
export function notifyProjectBoards(projectId: string): Promise<void> {
  return safely('a round change', async () => {
    const boards = await prisma.board.findMany({ where: { projectId }, select: { id: true } })
    await emitToBoards(boards.map(b => b.id))
  })
}
