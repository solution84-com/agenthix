/**
 * Tells the browsers watching a project's boards that its tasks changed (the `taskUpdated` socket event a board
 * refreshes on). A task is on no board (adr-0176), so every board of its project may show it: the event goes to the
 * project's own room, `board:<projectId>`, which every board of it joins, the built-in ones included, and to each
 * saved board's room. Every write of a task's place or run state calls one of these after it, so a board never shows
 * a state that has already moved on. A notification never fails the write it follows.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BoardNotify')

async function emitToProjects(projectIds: Iterable<string | null | undefined>): Promise<void> {
  const ids = [...new Set([...projectIds].filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const saved = await prisma.board.findMany({ where: { projectId: { in: ids } }, select: { id: true } })
  const { emitTaskUpdated } = await import('../server/socket')
  for (const id of [...ids, ...saved.map(b => b.id)]) emitTaskUpdated(id)
}

async function safely(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    logger.warn(`could not notify boards after ${what}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The boards of these tasks' projects, each told once. */
export function notifyBoardsOfTasks(taskIds: string[]): Promise<void> {
  return safely('a task change', async () => {
    if (taskIds.length === 0) return
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { projectId: true } })
    await emitToProjects(tasks.map(t => t.projectId))
  })
}

/** The projects of the tasks `where` selects, read before a bulk write changes what it selects. */
export async function projectsOfTasksWhere(where: Prisma.TaskWhereInput): Promise<string[]> {
  try {
    const tasks = await prisma.task.findMany({ where, select: { projectId: true }, distinct: ['projectId'] })
    return tasks.map(t => t.projectId)
  } catch (err) {
    logger.warn(`could not read the boards to notify: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

/** Every board of these projects. */
export function notifyProjectBoards(projectIds: string | string[]): Promise<void> {
  return safely('a task change', () => emitToProjects(typeof projectIds === 'string' ? [projectIds] : projectIds))
}
