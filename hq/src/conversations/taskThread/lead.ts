/**
 * A task's thread and its lead (the overview's task-thread rules, 6): at most one thread per task, and its lead is
 * the task's agent, whoever that is now — read from the task, never fixed on the conversation (`agentId` stays
 * null there). An unassigned task's thread has no lead: it is read, and nobody speaks in it until an agent is
 * assigned.
 */
import { prisma } from 'wasp/server'

export const ASSIGN_AN_AGENT = 'Assign an agent to talk here.'

/** The task's agent now, or null when it has none or the task is gone. */
export async function taskLeadId(taskId: string | null): Promise<string | null> {
  if (!taskId) return null
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgentId: true } })
  return task?.assignedAgentId ?? null
}

/** The agent a conversation talks with now: a task thread's is its task's; any other's is fixed on it. */
export async function leadAgentId(conversation: { home: string; taskId: string | null; agentId: string | null }): Promise<string | null> {
  return conversation.home === 'TASK' ? taskLeadId(conversation.taskId) : conversation.agentId
}

/** The task's thread, when one has been started. */
export async function threadOfTask(taskId: string): Promise<{ id: string } | null> {
  return prisma.conversation.findUnique({ where: { taskId }, select: { id: true } })
}
