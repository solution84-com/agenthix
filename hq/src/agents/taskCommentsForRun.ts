/**
 * A task's comments as an agent reads them (every-screen-reviewed spec §9, "The
 * agent reads the comments"). A run is given the newest ones not its agent's
 * own, and the site keeps those written since that agent's last run on the task
 * (site `taskComments.ts`); `get_task_details` returns the rest. The approval
 * markers hq writes as comments are machinery, not discussion, and are left out.
 */
import { prisma } from 'wasp/server'
import { TASK_COMMENTS_FOR_RUN_MAX, TASK_COMMENT_TEXT_MAX, type TaskCommentForRun } from '@agenthix/core'
import { usernames } from '../projects/onBehalfOfOperations'

const MARKER_PREFIX = '__MANIFEST_'
/** `get_task_details` returns at most this many, newest kept. */
export const TASK_DETAILS_COMMENTS_MAX = 200

type CommentRow = {
  authorType: 'USER' | 'AGENT'
  userId: string | null
  content: string
  createdAt: Date
  agent: { handle: string } | null
}

export type TaskCommentForAgent = TaskCommentForRun & { authorType: 'USER' | 'AGENT' }

function clip(text: string): string {
  return text.length > TASK_COMMENT_TEXT_MAX ? `${text.slice(0, TASK_COMMENT_TEXT_MAX - 1)}…` : text
}

async function readComments(
  taskId: string,
  take: number,
  excludeAgentId: string | null,
): Promise<TaskCommentForAgent[]> {
  const rows: CommentRow[] = await prisma.taskComment.findMany({
    where: {
      taskId,
      NOT: [{ content: { startsWith: MARKER_PREFIX } }, ...(excludeAgentId ? [{ authorType: 'AGENT' as const, agentId: excludeAgentId }] : [])],
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: { authorType: true, userId: true, content: true, createdAt: true, agent: { select: { handle: true } } },
  })
  const names = await usernames([...new Set(rows.map(r => r.userId).filter((id): id is string => !!id))])
  return rows.reverse().map(r => ({
    author: r.authorType === 'AGENT' ? `@${r.agent?.handle ?? 'agent'}` : (r.userId && names.get(r.userId)) || 'Someone',
    authorType: r.authorType,
    at: r.createdAt.toISOString(),
    text: r.content,
  }))
}

/** The newest comments not by this agent, oldest first, each clipped — what a task run's dispatch carries. */
export async function taskCommentsForRun(taskId: string, agentId: string): Promise<TaskCommentForRun[]> {
  const comments = await readComments(taskId, TASK_COMMENTS_FOR_RUN_MAX, agentId)
  return comments.map(({ author, at, text }) => ({ author, at, text: clip(text) }))
}

/** Every comment an agent may read, oldest first — what `get_task_details` returns. */
export function taskCommentsForAgent(taskId: string): Promise<TaskCommentForAgent[]> {
  return readComments(taskId, TASK_DETAILS_COMMENTS_MAX, null)
}
