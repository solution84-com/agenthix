/**
 * An agent's recent runs as one person may see them, narrowed to a place or to
 * the runs on their behalf. Read the way the Runs tool reads runs — every site
 * once, merged into one order (`sessions/mergedRunFeed.ts`) — with the same
 * visibility rule (`runVisibilityFilter`: a chat is its person's, a task run its
 * project's members'). Never a run's input or output: a line names the run, its
 * conversation or task, and its times.
 */
import { prisma } from 'wasp/server'
import type { RunRow, SiteSilence } from '@agenthix/core'
import { readMergedRunFeed } from '../sessions/mergedRunFeed'
import { runVisibilityFilter, type OwnedSession } from '../sessions/runReadHelpers'

export type RecentRun = {
  id: string
  sessionId: string
  status: RunRow['status']
  kind: 'conversation' | 'task'
  /** The conversation's title, or the task's. */
  title: string | null
  taskId: string | null
  taskKey: string | null
  model: string
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

export type RecentRuns = { runs: RecentRun[]; unanswered: SiteSilence[] }

/** Read deeper than shown, because the narrowing drops rows after each site answers. */
const READ_DEPTH = 50
export const RECENT_RUNS_SHOWN = 10

export async function recentAgentRuns(
  userId: string,
  agentId: string,
  keep: (runs: Array<{ run: RunRow; session: OwnedSession }>) => Promise<RunRow[]> | RunRow[],
): Promise<RecentRuns> {
  const { visible, sessionById } = runVisibilityFilter(userId)
  const feed = await readMergedRunFeed({
    limit: READ_DEPTH,
    filter: { agentId },
    visible: async (runs) => keep((await visible(runs)).flatMap((run) => {
      const session = sessionById.get(run.sessionId)
      return session ? [{ run, session }] : []
    })),
  })
  const shown = feed.runs.slice(0, RECENT_RUNS_SHOWN)
  const taskIds = [...new Set(shown.map((r) => r.taskId).filter((id): id is string => !!id))]
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, number: true, title: true, project: { select: { key: true } } },
  })
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  return {
    runs: shown.map((r) => {
      const task = r.taskId ? taskById.get(r.taskId) : undefined
      const session = sessionById.get(r.sessionId)
      return {
        id: r.id,
        sessionId: r.sessionId,
        status: r.status,
        kind: r.taskId ? 'task' : 'conversation',
        title: task?.title ?? session?.title ?? null,
        taskId: r.taskId,
        taskKey: task ? `${task.project.key}-${task.number}` : null,
        model: r.model,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        createdAt: r.createdAt,
      }
    }),
    unanswered: feed.unanswered,
  }
}

/** Whether a run's session is in this project: a task of it, or a conversation placed in it. */
export function sessionInProject(session: OwnedSession, projectId: string): boolean {
  if (session.task) return session.task.projectId === projectId
  return session.primaryOwnerType === 'project' && session.primaryOwnerId === projectId
}

export const inProject = (projectId: string) =>
  (runs: Array<{ run: RunRow; session: OwnedSession }>) => runs.filter(({ session }) => sessionInProject(session, projectId)).map(({ run }) => run)

/**
 * The runs on this person's behalf: the person a dispatch named, else a chat's
 * person, else its task's person (adr-0089, adr-0095) — `usageTotals.runPerson`'s
 * rule, read off the run row and hq's tasks.
 */
export function onBehalfOf(userId: string) {
  return async (runs: Array<{ run: RunRow; session: OwnedSession }>): Promise<RunRow[]> => {
    const taskIds = [...new Set(runs.map(({ run }) => run.taskId).filter((id): id is string => !!id))]
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, onBehalfOfUserId: true } })
    const personOfTask = new Map(tasks.map((t) => [t.id, t.onBehalfOfUserId]))
    return runs.filter(({ run, session }) => {
      const named = (run.metadata as { dispatch?: { onBehalfOfUserId?: unknown } } | null)?.dispatch?.onBehalfOfUserId
      if (typeof named === 'string') return named === userId
      if (session.sessionType === 'chat') return session.userId === userId
      return run.taskId !== null && personOfTask.get(run.taskId) === userId
    }).map(({ run }) => run)
  }
}
