/**
 * A task's thread follows its task (the overview's task-thread rules, 6; on-screen spec, A task's thread): its
 * lead changes with the task's agent, with a quiet line; it archives with the task; it closes when the task is
 * deleted, declining what still waits in it. Each is called where the task changes (projects/), and none of them
 * stops the change: a failure is logged and the task's change stands.
 *
 * Imported by projects/, so the coordinator and the closing are reached when called, not at load: they import
 * back into projects/.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { appendMessage } from '../store/messages'
import { conversationEvents } from '../coordinator/events'
import { takeoverLine } from './takeover'

const logger = new Logger('TaskThread')

async function agentName(agentId: string | null): Promise<string | null> {
  if (!agentId) return null
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  return agent?.name ?? null
}

/**
 * The tasks' agent went from one to another: each of their threads gets the quiet line, and anything waiting in
 * it for an agent is taken up by the new one.
 */
export async function taskLeadChanged(taskIds: readonly string[], fromAgentId: string | null, toAgentId: string | null): Promise<void> {
  if (taskIds.length === 0 || fromAgentId === toAgentId) return
  try {
    const threads = await prisma.conversation.findMany({
      where: { home: 'TASK', taskId: { in: [...taskIds] }, status: { not: 'CLOSED' } },
      select: { id: true },
    })
    if (threads.length === 0) return
    const line = takeoverLine(await agentName(fromAgentId), await agentName(toAgentId))
    for (const thread of threads) {
      if (line) {
        const { message } = await appendMessage({ conversationId: thread.id, role: 'PLATFORM', kind: 'NOTICE', body: { text: line } })
        conversationEvents.message(thread.id, message)
      }
      if (toAgentId) (await import('../coordinator/scheduler')).scheduleConversation(thread.id)
    }
  } catch (err) {
    logger.error(`Could not tell the threads of tasks ${taskIds.join(', ')} that their agent changed`, err)
  }
}

/** The task was archived: its thread is archived with it. */
export async function taskArchived(taskId: string): Promise<void> {
  try {
    await prisma.conversation.updateMany({
      where: { home: 'TASK', taskId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })
  } catch (err) {
    logger.error(`Could not archive the thread of task ${taskId}`, err)
  }
}

export type TaskThreadsClosing = { taskIds: string[] } | { projectId: string }

/**
 * Closes the threads of tasks being deleted, inside the transaction that deletes them; the closed threads' ids
 * come back so the caller can decline what waits in them once it has committed (`declineWaitingInThreads`).
 */
export async function closeTaskThreads(
  tx: Prisma.TransactionClient,
  which: TaskThreadsClosing,
  reason: 'TASK_DELETED' | 'PROJECT_DELETED',
): Promise<string[]> {
  const where: Prisma.ConversationWhereInput = 'taskIds' in which
    ? { home: 'TASK', taskId: { in: which.taskIds } }
    : { home: 'TASK', projectId: which.projectId }
  const open = await tx.conversation.findMany({ where: { ...where, status: { not: 'CLOSED' } }, select: { id: true } })
  if (open.length === 0) return []
  await tx.conversation.updateMany({
    where: { id: { in: open.map(c => c.id) } },
    data: { status: 'CLOSED', closedReason: reason, voiceHolderId: null },
  })
  return open.map(c => c.id)
}

/** After the deletion committed: each closed thread's waiting requests are declined. Never throws. */
export async function declineWaitingInThreads(conversationIds: readonly string[]): Promise<void> {
  if (conversationIds.length === 0) return
  const { declineWaitingIn } = await import('../closing')
  for (const id of conversationIds) {
    try {
      await declineWaitingIn(id)
    } catch (err) {
      logger.error(`Could not decline what waits in the closed thread ${id}`, err)
    }
  }
}

/** One task deleted outside a transaction of the caller's: its thread closed, and what waits in it declined. */
export async function taskDeleted(taskId: string): Promise<void> {
  try {
    const closed = await prisma.$transaction(tx => closeTaskThreads(tx, { taskIds: [taskId] }, 'TASK_DELETED'))
    await declineWaitingInThreads(closed)
  } catch (err) {
    logger.error(`Could not close the thread of deleted task ${taskId}`, err)
  }
}
