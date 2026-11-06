import { HttpError, prisma } from 'wasp/server'
import type { TaskActivityKind } from '@prisma/client'
import { requireTaskVisible } from './resourceEntitlement'
import { usernames } from './onBehalfOfOperations'
import type { TaskActivityDetail } from './taskActivity'

/** One line of a task's Activity: what happened, who did it by name ("You" for the reader), and when. */
export type TaskActivityRow = {
  id: string
  kind: TaskActivityKind
  /** 'person', 'agent', or 'hq' when HQ itself did it. */
  by: 'person' | 'agent' | 'hq'
  userId: string | null
  agentId: string | null
  /** The person's or agent's name; null for HQ. */
  name: string | null
  runId: string | null
  detail: TaskActivityDetail
  createdAt: Date
}

export const ACTIVITY_PAGE = 100

/**
 * A task's activity, newest first, a page at a time: `before` is the oldest row's time already shown. Whoever may
 * see the task may read it.
 */
export const getTaskActivity = async (
  args: { taskId: string; before?: string | null },
  context: { user?: { id: string } | null },
): Promise<TaskActivityRow[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.taskId !== 'string' || !args.taskId) throw new HttpError(400, 'Name the task')
  const before = typeof args.before === 'string' ? new Date(args.before) : null
  if (before && Number.isNaN(before.getTime())) throw new HttpError(400, 'before is a time')
  await requireTaskVisible(args.taskId, context.user.id)
  const rows = await prisma.taskActivity.findMany({
    where: { taskId: args.taskId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ACTIVITY_PAGE,
  })
  const me = context.user.id
  const people = await usernames(rows.flatMap(r => (r.userId ? [r.userId] : [])))
  const agentIds = [...new Set(rows.flatMap(r => (r.agentId ? [r.agentId] : [])))]
  const agents = new Map((await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })).map(a => [a.id, a.name]))
  return rows.map(r => ({
    id: r.id, kind: r.kind,
    by: r.userId ? 'person' : r.agentId ? 'agent' : 'hq',
    userId: r.userId, agentId: r.agentId,
    name: r.userId ? (r.userId === me ? 'You' : people.get(r.userId) ?? 'A removed person') : r.agentId ? agents.get(r.agentId) ?? 'A removed agent' : null,
    runId: r.runId,
    detail: r.detail as TaskActivityDetail,
    createdAt: r.createdAt,
  }))
}
