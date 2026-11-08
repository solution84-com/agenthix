/**
 * Today's runs of the Workrooms asked for, from the sites (runs live there): the task sessions of the projects and the
 * conversations' sessions in them, asked for in one request per site. A run carries no content here (ADR-0077): a
 * reply is named by its conversation's title only for the person whose conversation it is.
 */
import { prisma } from 'wasp/server'
import { RUN_SESSION_IDS_MAX, type RunRow, type SiteSilence } from '@agenthix/core'
import { readMergedRunFeed } from '../../sessions/mergedRunFeed'
import { calculateCost } from '../../shared/utils/aiMetrics'
import { mineTasks } from './workroomTasks'

/** The newest runs read across the sessions; a Workroom with more today counts the newest this many. */
export const TODAY_RUN_WINDOW = 500

export type RunSession = {
  id: string
  projectId: string
  taskId: string | null
  /** A reply's title, when the viewer may read it; null otherwise and for a task's session. */
  replyTitle: string | null
  /** The reply's conversation, for the person whose conversation it is. */
  replyConversationId: string | null
}

export type TodayRuns = {
  sessions: Map<string, RunSession>
  runs: RunRow[]
  /** The sites that did not answer. */
  unanswered: SiteSilence[]
}

/** The sessions whose runs a Workroom counts: its tasks', and the conversations' replies in it. */
async function runSessions(projectIds: string[], me: string, mine: boolean): Promise<RunSession[]> {
  const [taskSessions, replySessions] = await Promise.all([
    prisma.agentSession.findMany({
      where: { task: { projectId: { in: projectIds }, ...(mine ? { AND: [mineTasks(me)] } : {}) } },
      orderBy: { updatedAt: 'desc' },
      take: RUN_SESSION_IDS_MAX,
      select: { id: true, taskId: true, task: { select: { projectId: true } } },
    }),
    prisma.agentSession.findMany({
      where: { taskId: null, primaryOwnerType: 'project', primaryOwnerId: { in: projectIds }, ...(mine ? { userId: me } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: RUN_SESSION_IDS_MAX,
      select: { id: true, userId: true, title: true, primaryOwnerId: true, conversationId: true },
    }),
  ])
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: replySessions.filter(s => s.userId === me && s.conversationId).map(s => s.conversationId as string) } },
    select: { id: true, title: true },
  })
  const titleOf = new Map(conversations.map(c => [c.id, c.title]))
  return [
    ...taskSessions.map(s => ({ id: s.id, projectId: s.task!.projectId, taskId: s.taskId, replyTitle: null, replyConversationId: null })),
    ...replySessions.map((s) => {
      const own = s.userId === me
      return {
        id: s.id, projectId: s.primaryOwnerId as string, taskId: null,
        replyTitle: own ? (s.conversationId ? titleOf.get(s.conversationId) : null) ?? s.title ?? null : null,
        replyConversationId: own ? s.conversationId : null,
      }
    }),
  ].slice(0, RUN_SESSION_IDS_MAX)
}

/** Today's runs, and every run still going whenever it started. */
export async function readTodayRuns(projectIds: string[], me: string, mine: boolean, from: Date): Promise<TodayRuns> {
  const sessions = await runSessions(projectIds, me, mine)
  if (sessions.length === 0) return { sessions: new Map(), runs: [], unanswered: [] }
  const feed = await readMergedRunFeed({ limit: TODAY_RUN_WINDOW, filter: { sessionIds: sessions.map(s => s.id) } })
  const fromMs = from.getTime()
  return {
    sessions: new Map(sessions.map(s => [s.id, s])),
    runs: feed.runs.filter(r => isGoing(r) || new Date(r.createdAt).getTime() >= fromMs),
    unanswered: feed.unanswered,
  }
}

export function isGoing(run: Pick<RunRow, 'status' | 'manifestStatus'>): boolean {
  return (run.status === 'RUNNING' || run.status === 'PENDING') && run.manifestStatus !== 'PENDING_APPROVAL'
}

export function isEnded(run: Pick<RunRow, 'status'>): boolean {
  return run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED'
}

/** A run's cost in dollars, estimated from its tokens; 0 when it reported none or its model has no price. */
export function runCost(run: Pick<RunRow, 'usage' | 'model'>): number {
  return run.usage ? calculateCost(run.usage, run.model) : 0
}
