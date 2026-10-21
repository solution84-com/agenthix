/**
 * The comments a task run is given as new (every-screen-reviewed spec §9): of
 * the newest comments hq sent, those written after this agent's last run on
 * the task started. Only the site holds its runs, so only it can tell which
 * are new; read before the run being started is created, so that run is not
 * its own "last run".
 */
import { prisma } from '#db'
import type { TaskCommentForRun } from '@agenthix/core'

export async function commentsSinceLastRun(
  taskId: string,
  agentId: string,
  comments: TaskCommentForRun[] | undefined,
): Promise<TaskCommentForRun[]> {
  if (!comments || comments.length === 0) return []
  const last = await prisma.agentRun.findFirst({
    where: { taskId, agentId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!last) return comments
  const since = last.createdAt.getTime()
  return comments.filter(c => Date.parse(c.at) > since)
}
