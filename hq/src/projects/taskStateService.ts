/**
 * Task State Service
 * ==================
 * Task comments. No auth, no HTTP. Re-exported from `projectService`. A task's
 * run state is the system's alone (TaskRunner, the status listener); closing a
 * task is a move into a done column (taskService.ts).
 */
import { prisma } from 'wasp/server'

// ── Task Comments ─────────────────────────────────────────────────────────────

export async function createTaskComment({
  taskId,
  authorType,
  agentId,
  userId,
  connectionId,
  runId,
  content,
}: {
  taskId: string
  authorType: 'AGENT' | 'USER'
  agentId?: string
  userId?: string
  /** The person's connection a USER comment arrives through, when it does (adr-0090). */
  connectionId?: string
  runId?: string
  content: string
}) {
  const comment = await prisma.taskComment.create({
    data: { taskId, authorType, agentId: agentId ?? null, userId: userId ?? null, connectionId: connectionId ?? null, runId: runId ?? null, content },
    include: { agent: { select: { id: true, name: true, handle: true } } },
  })

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
    content: comment.content,
    createdAt: comment.createdAt,
  })

  return comment
}
