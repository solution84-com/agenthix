import { HttpError } from 'wasp/server'
import type { GetMyTasks } from 'wasp/server/operations'
import type { TaskListItem } from '@agenthix/core'
import { entitledProjectsFilter } from './membership'
import { withDisplayReasons } from './taskReasonDisplay'
import { withRunWaitNotes } from '../automation/queueNotes'
import { LISTED_TASK_INCLUDE, projectTaskListItem, taskProjectRef } from './taskWire'

/** Finished work older than this is left out: Your tasks shows the last 30 days of it (spec §3). */
export const DONE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Your tasks (every screen reviewed spec §3): the tasks done on the caller's
 * behalf, in every project they may see — their own space included. Finished
 * work only as far back as the Done view shows.
 */
export const getMyTasks: GetMyTasks<void, TaskListItem[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const since = new Date(Date.now() - DONE_WINDOW_MS)
  const tasks = await context.entities.Task.findMany({
    where: {
      onBehalfOfUserId: context.user.id,
      archived: false,
      project: entitledProjectsFilter(context.user.id),
      OR: [{ status: { not: 'DONE' } }, { doneAt: { gte: since } }],
    },
    include: { ...LISTED_TASK_INCLUDE, project: { select: { id: true, name: true, key: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const shown = await withRunWaitNotes(await withDisplayReasons(tasks))
  return shown.map(t => ({ ...projectTaskListItem(t), project: taskProjectRef(t.project) }))
}
