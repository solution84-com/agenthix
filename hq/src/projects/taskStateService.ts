/**
 * Task State Service
 * ==================
 * Task comments. No auth, no HTTP. Re-exported from `projectService`. A task's
 * run state is the system's alone (TaskRunner, the status listener); closing a
 * task is a move into a done column (taskService.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import { recordTaskActivity } from './taskActivity'

/** What hq writes as a comment to carry a tool request or its denial: a record of the run, not someone commenting. */
const RUN_MARKER = /^__MANIFEST_[A-Z]+__/

/** A reply's comment is a top-level comment of the same task: replies go one level deep. */
async function requireReplyParent(taskId: string, parentId: string): Promise<void> {
  const parent = await prisma.taskComment.findUnique({ where: { id: parentId }, select: { taskId: true, parentId: true } })
  if (!parent || parent.taskId !== taskId) {
    throw new HttpError(404, 'The comment this replies to is not on this task. Nothing was changed.')
  }
  if (parent.parentId !== null) {
    throw new HttpError(400, 'A reply goes under the comment that starts the thread, not under another reply. Nothing was changed.')
  }
}

// ── Task Comments ─────────────────────────────────────────────────────────────

export async function createTaskComment({
  taskId,
  authorType,
  agentId,
  userId,
  connectionId,
  runId,
  content,
  parentId,
  savedFromConversation,
}: {
  taskId: string
  authorType: 'AGENT' | 'USER'
  agentId?: string
  userId?: string
  /** The person's connection a USER comment arrives through, when it does (adr-0090). */
  connectionId?: string
  runId?: string
  content: string
  /** The top-level comment of the same task this one replies to. */
  parentId?: string
  /** Saved from the task's conversation (Save to the task). */
  savedFromConversation?: boolean
}) {
  if (parentId) await requireReplyParent(taskId, parentId)
  const comment = await prisma.taskComment.create({
    data: { taskId, authorType, agentId: agentId ?? null, userId: userId ?? null, connectionId: connectionId ?? null, runId: runId ?? null, content, parentId: parentId ?? null, savedFromConversation: savedFromConversation ?? false },
    include: { agent: { select: { id: true, name: true, handle: true } } },
  })
  if (!RUN_MARKER.test(content)) {
    const actor = authorType === 'AGENT' ? (agentId ? { kind: 'agent' as const, agentId } : null) : (userId ? { kind: 'person' as const, userId } : null)
    await recordTaskActivity({ taskId, kind: 'COMMENTED', actor, detail: { commentId: comment.id, parentId: comment.parentId } })
  }

  const io = (globalThis as any).__wasp_io__
  io?.to(`task:${taskId}`).emit('taskCommentAdded', {
    id: comment.id,
    taskId: comment.taskId,
    authorType: comment.authorType,
    agentId: comment.agentId,
    agentName: comment.agent?.name ?? null,
    agentHandle: comment.agent?.handle ?? null,
    userId: comment.userId,
    runId: comment.runId,
    parentId: comment.parentId,
    content: comment.content,
    createdAt: comment.createdAt,
  })

  return comment
}
